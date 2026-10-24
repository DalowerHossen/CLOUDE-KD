-- path: sql/assertions/s16_021_settlement.sql
-- Settlement ledger: RLS on; entries obey their sign and net rules and are unique by kind and reference; the ledger cannot change;
-- terms are versioned, not edited; the balance splits pending from available; a payout is atomic, idempotent, never above the available
-- balance or below the minimum, and only goes from recorded to void; rows belong to the company of their sub-merchant.
do $$
declare
  c uuid; d uuid; s uuid; sd uuid; t uuid; n integer; p uuid; p2 uuid; b record;
  k1 text := repeat('k', 20);
  k2 text := repeat('m', 20);
  now_ timestamptz := now();
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('settlement_terms', 'settlement_entries', 'settlement_payouts') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Settle Co', 'settle-co') returning id into c;
  insert into public.companies (name, slug) values ('Settle Other', 'settle-other') returning id into d;
  insert into public.sub_merchants (company_id, name, reference) values (c, 'Shop', 'shop-1') returning id into s;
  insert into public.sub_merchants (company_id, name, reference) values (d, 'Other', 'shop-9') returning id into sd;

  insert into public.settlement_terms (company_id, sub_merchant_id, commission_percent, fixed_fee, hold_days, min_payout)
    values (c, s, 2.5000, 0.3000, 7, 10) returning id into t;
  begin insert into public.settlement_terms (company_id, commission_percent) values (c, 101); assert false, 'percent range';
  exception when check_violation then null; end;
  begin insert into public.settlement_terms (company_id, sub_merchant_id) values (c, sd); assert false, 'terms of a foreign sub-merchant';
  exception when sqlstate 'P0002' then null; end;
  begin update public.settlement_terms set commission_percent = 3 where id = t; assert false, 'terms are not edited';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.settlement_terms (company_id, commission_percent, hold_days) values (c, 1, 0);

  -- a sale of 100 on hold: commission 2.5, fee 0.3, net 97.2
  insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, fixed_fee, net, external_ref, occurred_at, available_at, terms_id)
    values (c, s, 'sale', 100, 2.5, 0.3, 97.2, 'o-1', now_, now_ + interval '7 days', t);
  -- an older sale of 50: commission 1.25, fee 0.3, net 48.45, already available
  insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, fixed_fee, net, external_ref, occurred_at, available_at, terms_id)
    values (c, s, 'sale', 50, 1.25, 0.3, 48.45, 'o-0', now_ - interval '10 days', now_ - interval '3 days', t);
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, fixed_fee, net, external_ref, occurred_at, available_at)
    values (c, s, 'sale', 100, 2.5, 0.3, 97.2, 'o-1', now_, now_); assert false, 'one entry per kind and reference';
  exception when unique_violation then null; end;
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, net, external_ref, occurred_at, available_at)
    values (c, s, 'sale', -5, -5, 'bad-1', now_, now_); assert false, 'a sale is positive';
  exception when check_violation then null; end;
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, net, external_ref, occurred_at, available_at)
    values (c, s, 'refund', 5, 5, 'bad-2', now_, now_); assert false, 'a refund is negative';
  exception when check_violation then null; end;
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, fixed_fee, net, external_ref, occurred_at, available_at)
    values (c, s, 'sale', 10, 0.25, 0, 10, 'bad-3', now_, now_); assert false, 'net must equal gross minus commission and fee';
  exception when check_violation then null; end;
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, net, external_ref, occurred_at, available_at)
    values (c, s, 'adjustment', 10, 1, 9, 'bad-4', now_, now_); assert false, 'an adjustment has no commission';
  exception when check_violation then null; end;
  begin insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, net, external_ref, occurred_at, available_at)
    values (d, s, 'sale', 10, 10, 'bad-5', now_, now_); assert false, 'entry of a foreign sub-merchant';
  exception when sqlstate 'P0002' then null; end;
  begin update public.settlement_entries set note = 'x' where company_id = c; assert false, 'ledger is append-only';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.settlement_entries where company_id = c; assert false, 'ledger cannot be deleted';
  exception when object_not_in_prerequisite_state then null; end;

  select * into b from public.kd_settlement_balance(c, s, now_);
  assert b.total_net::numeric = 145.65, 'total net 97.2 + 48.45';
  assert b.pending::numeric = 97.2, 'the sale on hold is pending';
  assert b.paid::numeric = 0, 'nothing paid';
  assert b.available::numeric = 48.45, 'available is the old sale';
  assert (select count(*) from public.kd_settlement_entries_text(c, s, 10, null)) = 2, 'entries as text';
  assert (select net from public.kd_settlement_entries_text(c, s, 1, null)) = '97.2000', 'exact text, newest first';

  -- payouts
  begin perform public.kd_settlement_record_payout(c, s, 5, 'ref', k1, now_, null, 10); assert false, 'below the minimum';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_settlement_record_payout(c, s, 48.4501, 'ref', k1, now_, null, 10); assert false, 'above the available balance';
  exception when invalid_parameter_value then null; end;
  p := public.kd_settlement_record_payout(c, s, 40, 'bank-1', k1, now_, null, 10);
  assert p = public.kd_settlement_record_payout(c, s, 40, 'bank-1', k1, now_, null, 10), 'same key, same payout';
  begin perform public.kd_settlement_record_payout(c, s, 41, 'bank-1', k1, now_, null, 10); assert false, 'key reused for another amount';
  exception when object_not_in_prerequisite_state then null; end;
  begin perform public.kd_settlement_record_payout(c, s, 10, 'bank-2', k2, now_, null, 10); assert false, 'only 8.45 is left';
  exception when invalid_parameter_value then null; end;
  select * into b from public.kd_settlement_balance(c, s, now_);
  assert b.paid::numeric = 40 and b.available::numeric = 8.45, 'balance after the payout';
  assert (select count(*) from public.settlement_payouts where company_id = c) = 1, 'one payout row';

  begin update public.settlement_payouts set amount = 1 where id = p; assert false, 'amount fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.settlement_payouts set status = 'void', void_reason = 'sent to the wrong account', voided_at = now() where id = p;
  begin update public.settlement_payouts set status = 'recorded', voided_at = null where id = p; assert false, 'void stays void';
  exception when object_not_in_prerequisite_state then null; end;
  select * into b from public.kd_settlement_balance(c, s, now_);
  assert b.paid::numeric = 0 and b.available::numeric = 48.45, 'a void payout returns the amount';

  -- a refund beyond the sales makes the balance negative
  insert into public.settlement_entries (company_id, sub_merchant_id, kind, gross, commission, net, external_ref, occurred_at, available_at)
    values (c, s, 'chargeback', -200, -5, -195, 'cb-1', now_, now_);
  select * into b from public.kd_settlement_balance(c, s, now_);
  assert b.available::numeric = 48.45 - 195, 'refunds count at once';
  begin perform public.kd_settlement_record_payout(c, s, 10, 'bank-3', k2, now_, null, 0); assert false, 'no payout from a negative balance';
  exception when invalid_parameter_value then null; end;
end $$;
