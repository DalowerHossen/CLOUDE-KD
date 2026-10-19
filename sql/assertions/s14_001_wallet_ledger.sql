-- path: sql/assertions/s14_001_wallet_ledger.sql
-- Wallet ledger: RLS on, the balance always equals the ledger sum, a credit and a debit move money, a debit cannot
-- overdraw (unless it says so), a hold moves money to held and a release back, the same key is a replay, the same key
-- with another request is refused, unbalanced legs are refused, ledger rows cannot be changed, balances cannot be
-- written by hand.
do $$
declare
  c uuid; w uuid; r jsonb; h uuid; n integer; bad integer;
  k text;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('wallets', 'wallet_postings', 'ledger_entries', 'wallet_holds', 'fee_schedules') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Wallet Co', 'wallet-co') returning id into c;
  insert into public.wallets (company_id) values (c) returning id into w;
  begin insert into public.wallets (company_id) values (c); assert false, 'two wallets for one company';
  exception when unique_violation then null; end;

  -- credit 100
  r := public.kd_wallet_post(c, 'credit-0001', 'Test credit', 'test', null,
    jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '100.0000'),
                      jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-100.0000')), null);
  assert (r->>'replay')::boolean = false, 'first posting is new';
  assert (select available_balance from public.wallets where id = w) = 100, 'credited';

  -- the same key and request again: a replay, no second credit
  r := public.kd_wallet_post(c, 'credit-0001', 'Test credit', 'test', null,
    jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '100.0000'),
                      jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-100.0000')), null);
  assert (r->>'replay')::boolean = true, 'second call is a replay';
  assert (select available_balance from public.wallets where id = w) = 100, 'no second credit';
  -- the same key with another amount is refused
  begin
    perform public.kd_wallet_post(c, 'credit-0001', 'Test credit', 'test', null,
      jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '5.0000'),
                        jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-5.0000')), null);
    assert false, 'key reused for another request';
  exception when unique_violation then null; end;

  -- legs that do not add up to zero
  begin
    perform public.kd_wallet_post(c, 'bad-sum-0001', 'Bad', 'test', null,
      jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '10.0000'),
                        jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-9.0000')), null);
    assert false, 'unbalanced legs';
  exception when invalid_parameter_value then null; end;
  -- a company account without a wallet, a platform account with one
  begin
    perform public.kd_wallet_post(c, 'bad-leg-0001', 'Bad', 'test', null,
      jsonb_build_array(jsonb_build_object('wallet_id', null, 'account', 'available', 'amount', '10.0000'),
                        jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-10.0000')), null);
    assert false, 'company account without wallet';
  exception when invalid_parameter_value then null; end;

  -- a debit above the balance is refused and leaves nothing behind
  begin
    perform public.kd_wallet_post(c, 'debit-big-001', 'Too much', 'test', null,
      jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '-150.0000'),
                        jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '150.0000')), null);
    assert false, 'overdraw';
  exception when check_violation then null; end;
  assert (select available_balance from public.wallets where id = w) = 100, 'balance unchanged after refusal';
  select count(*) into n from public.wallet_postings where company_id = c and idempotency_key = 'debit-big-001';
  assert n = 0, 'the refused posting left no row';

  -- a hold: 30 moves from available to held
  r := public.kd_wallet_post(c, 'hold-000001', 'Hold', 'test', null,
    jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '-30.0000'),
                      jsonb_build_object('wallet_id', w, 'account', 'held', 'amount', '30.0000')), null,
    jsonb_build_object('wallet_id', w, 'amount', '30.0000', 'reason', 'New merchant hold', 'source', 'manual', 'release_at', (now() + interval '7 days')::text));
  h := (r->>'hold_id')::uuid;
  assert h is not null, 'hold row made';
  assert (select available_balance from public.wallets where id = w) = 70 and (select held_balance from public.wallets where id = w) = 30, 'available 70 held 30';
  r := public.kd_wallet_release_hold(c, h, null);
  assert (r->>'released')::boolean, 'released';
  assert (select available_balance from public.wallets where id = w) = 100 and (select held_balance from public.wallets where id = w) = 0, 'back to available';
  r := public.kd_wallet_release_hold(c, h, null);
  assert (r->>'replay')::boolean, 'second release is a replay';
  assert (select available_balance from public.wallets where id = w) = 100, 'no second release';

  -- a chargeback may take the balance below zero when the leg says so; a later credit recovers it
  perform public.kd_wallet_post(c, 'chargeback-01', 'Chargeback', 'test', null,
    jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '-130.0000', 'floor', false),
                      jsonb_build_object('wallet_id', null, 'account', 'processor_receivable', 'amount', '130.0000')), null);
  assert (select available_balance from public.wallets where id = w) = -30, 'negative balance allowed on request';
  perform public.kd_wallet_post(c, 'credit-0002', 'Recovery', 'test', null,
    jsonb_build_array(jsonb_build_object('wallet_id', w, 'account', 'available', 'amount', '50.0000'),
                      jsonb_build_object('wallet_id', null, 'account', 'clearing', 'amount', '-50.0000')), null);
  assert (select available_balance from public.wallets where id = w) = 20, 'a later credit pays the negative balance back';

  -- the balance equals the ledger sum, and every posting adds up to zero
  select count(*) into bad from public.kd_wallet_verify();
  assert bad = 0, 'balances equal the ledger';
  select count(*) into bad from (select posting_id from public.ledger_entries where company_id = c group by posting_id having sum(amount) <> 0) x;
  assert bad = 0, 'every posting adds up to zero';

  -- a wallet balance cannot be written by hand
  begin update public.wallets set available_balance = 999999 where id = w; assert false, 'balance written by hand';
  exception when insufficient_privilege then null; end;
  -- ledger rows cannot be changed or deleted
  begin update public.ledger_entries set amount = 1 where company_id = c; assert false, 'ledger edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.wallet_postings where company_id = c; assert false, 'posting deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;

  -- legs inserted by hand that do not add up are refused when the transaction ends (made immediate here)
  set constraints trg_ledger_balanced immediate;
  declare p uuid;
  begin
    insert into public.wallet_postings (company_id, idempotency_key, request_hash, reason, reference_type)
      values (c, 'manual-00001', repeat('a', 64), 'by hand', 'test') returning id into p;
    begin
      insert into public.ledger_entries (company_id, posting_id, account_code, amount) values (c, p, 'clearing', 5);
      assert false, 'unbalanced entry accepted';
    exception when check_violation then null; end;
  end;
  set constraints trg_ledger_balanced deferred;
end
$$;
