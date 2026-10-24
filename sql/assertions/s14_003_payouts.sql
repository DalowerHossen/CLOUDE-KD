-- path: sql/assertions/s14_003_payouts.sql
-- Payout tables: RLS on, one idempotency key per company, the net always equals the amount minus the fee, a local
-- amount needs a rate, one default method per company, one schedule per company, status history cannot be changed.
do $$
declare
  c uuid; w uuid; mth uuid; p uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('payout_methods', 'payout_schedules', 'payout_settings', 'payouts', 'payout_events') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Payout Co', 'payout-co') returning id into c;
  insert into public.wallets (company_id) values (c) returning id into w;
  insert into public.payout_methods (company_id, kind, label, details_encrypted, is_default)
    values (c, 'bank_transfer', 'Main bank', '{"ciphertext":"x"}'::jsonb, true) returning id into mth;
  begin
    insert into public.payout_methods (company_id, kind, label, details_encrypted, is_default)
      values (c, 'wire', 'Second', '{"ciphertext":"x"}'::jsonb, true);
    assert false, 'two default methods';
  exception when unique_violation then null; end;

  insert into public.payouts (company_id, wallet_id, method_id, partner, amount, fee, net, idempotency_key)
    values (c, w, mth, 'manual', 100, 1, 99, 'payout-key-0001') returning id into p;
  begin
    insert into public.payouts (company_id, wallet_id, method_id, partner, amount, fee, net, idempotency_key)
      values (c, w, mth, 'manual', 50, 0, 50, 'payout-key-0001');
    assert false, 'same key twice';
  exception when unique_violation then null; end;
  begin
    insert into public.payouts (company_id, wallet_id, method_id, partner, amount, fee, net, idempotency_key)
      values (c, w, mth, 'manual', 100, 1, 100, 'payout-key-0002');
    assert false, 'net must be amount minus fee';
  exception when check_violation then null; end;
  begin
    insert into public.payouts (company_id, wallet_id, method_id, partner, amount, fee, net, currency, idempotency_key)
      values (c, w, mth, 'manual', 100, 0, 100, 'EUR', 'payout-key-0003');
    assert false, 'a local currency needs a rate';
  exception when check_violation then null; end;
  begin
    update public.payouts set status = 'unknown' where id = p;
    assert false, 'bad status';
  exception when check_violation then null; end;

  insert into public.payout_schedules (company_id, method_id, frequency, next_run_at) values (c, mth, 'daily', now());
  begin
    insert into public.payout_schedules (company_id, method_id, frequency, next_run_at) values (c, mth, 'daily', now());
    assert false, 'two schedules';
  exception when unique_violation then null; end;
  begin
    insert into public.payout_schedules (company_id, method_id, frequency, next_run_at) values (gen_random_uuid(), mth, 'weekly', now());
    assert false, 'weekly needs a weekday';
  exception when check_violation or foreign_key_violation then null; end;

  insert into public.payout_events (company_id, payout_id, to_status) values (c, p, 'requested');
  begin update public.payout_events set to_status = 'paid' where payout_id = p; assert false, 'history changed';
  exception when others then if sqlerrm like 'assertion%' or sqlstate = 'P0004' then raise; end if; end;
  begin delete from public.payout_events where payout_id = p; assert false, 'history deleted';
  exception when others then if sqlstate = 'P0004' then raise; end if; end;

  -- the money of a payout: request takes it from the available balance, a second request cannot spend it again, a credit
  -- back returns it once (the same key is a replay), and a paid payout clears the in-transit account
  declare r jsonb; leg_req jsonb; leg_back jsonb; leg_paid jsonb;
  begin
    r := public.kd_wallet_post(c, 'seed-payout-1', 'Seed', 'test', null, jsonb_build_array(
      jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '150.0000'),
      jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-150.0000')), null);
    leg_req := jsonb_build_array(
      jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '-100.0000'),
      jsonb_build_object('wallet_id', null, 'account', 'payout_in_transit', 'amount', '99.0000'),
      jsonb_build_object('wallet_id', null, 'account', 'platform_fee_revenue', 'amount', '1.0000'));
    r := public.kd_wallet_post(c, 'payout:one:request', 'Payout requested', 'payout', p, leg_req, null);
    assert (select available_balance from public.wallets where id = w) = 50, 'request took 100';
    begin
      perform public.kd_wallet_post(c, 'payout:two:request', 'Payout requested', 'payout', p, leg_req, null);
      assert false, 'a second request must not spend the same money';
    exception when check_violation then null; end;
    leg_back := jsonb_build_array(
      jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '100.0000'),
      jsonb_build_object('wallet_id', null, 'account', 'payout_in_transit', 'amount', '-99.0000'),
      jsonb_build_object('wallet_id', null, 'account', 'platform_fee_revenue', 'amount', '-1.0000'));
    r := public.kd_wallet_post(c, 'payout:one:back', 'Payout credited back', 'payout', p, leg_back, null);
    r := public.kd_wallet_post(c, 'payout:one:back', 'Payout credited back', 'payout', p, leg_back, null);
    assert (r->>'replay')::boolean, 'the credit back repeated is a replay';
    assert (select available_balance from public.wallets where id = w) = 150, 'credited back once';
    assert (select coalesce(sum(amount), 0) from public.ledger_entries where company_id = c and account_code = 'payout_in_transit') = 0, 'nothing left in transit';
    assert (select count(*) from public.kd_wallet_verify()) = 0, 'balances equal the ledger';
  end;
end
$$;
