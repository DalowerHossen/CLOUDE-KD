-- path: sql/assertions/s14_002_settlement.sql
-- Settlement tables: RLS on, one platform settings row and one row per company, one settlement item per payment, a
-- cycle outside 1, 3 or 7 days and a reserve above 50 percent are refused.
do $$
declare
  c uuid; inv uuid; p uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('mor_settings', 'settlements', 'settlement_items') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.mor_settings (enabled) values (true);
  begin insert into public.mor_settings (enabled) values (false); assert false, 'two platform rows';
  exception when unique_violation then null; end;

  insert into public.companies (name, slug) values ('Settle Co', 'settle-co') returning id into c;
  insert into public.mor_settings (company_id, hold_days) values (c, 5);
  begin insert into public.mor_settings (company_id) values (c); assert false, 'two rows for one company';
  exception when unique_violation then null; end;
  begin insert into public.mor_settings (company_id, cycle_days) values (gen_random_uuid(), 2); assert false, 'bad cycle';
  exception when check_violation or foreign_key_violation then null; end;
  begin update public.mor_settings set reserve_percent = 60 where company_id = c; assert false, 'reserve above 50';
  exception when check_violation then null; end;

  insert into public.invoices (company_id, walk_in_name) values (c, 'Walk In') returning id into inv;
  insert into public.payments (company_id, invoice_id, status, amount, captured_amount, idempotency_key)
    values (c, inv, 'captured', 100, 100, 'settle-test-0001') returning id into p;
  insert into public.settlement_items (company_id, payment_id, invoice_id, mode, gross, fee, net)
    values (c, p, inv, 'direct', 100, 2, 98);
  begin
    insert into public.settlement_items (company_id, payment_id, invoice_id, mode, gross, fee, net)
      values (c, p, inv, 'direct', 100, 2, 98);
    assert false, 'two items for one payment';
  exception when unique_violation then null; end;
  begin update public.settlement_items set refunded = 150 where payment_id = p; assert false, 'refund above gross';
  exception when check_violation then null; end;
end
$$;
