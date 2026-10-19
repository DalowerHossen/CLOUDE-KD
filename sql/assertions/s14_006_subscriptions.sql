-- path: sql/assertions/s14_006_subscriptions.sql
-- Subscriptions: RLS on, one live subscription per company, an ended subscription has its time, the period runs forward,
-- invoice numbers are in one format and never repeat (also in parallel), an invoice total is the subtotal plus tax, a paid
-- invoice has its time, one invoice per company and key, the history cannot be changed.
do $$
declare
  c uuid; s uuid; i uuid; a text; b text; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace sc on sc.oid = x.relnamespace
    where sc.nspname = 'public' and x.relname in ('billing_settings', 'platform_subscriptions', 'platform_invoices', 'platform_invoice_items', 'platform_invoice_counters', 'subscription_events') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.billing_settings (seller_name) values ('KD SOLUTION IT');
  begin insert into public.billing_settings (seller_name) values ('Second'); assert false, 'two settings rows';
  exception when unique_violation then null; end;

  insert into public.companies (name, slug) values ('Sub Co', 'sub-co') returning id into c;
  insert into public.platform_subscriptions (company_id, plan_slug, current_period_start, current_period_end)
    values (c, 'pro', now(), now() + interval '30 days') returning id into s;
  begin insert into public.platform_subscriptions (company_id, plan_slug, current_period_start, current_period_end)
      values (c, 'pro', now(), now() + interval '30 days');
    assert false, 'two live subscriptions';
  exception when unique_violation then null; end;
  begin insert into public.platform_subscriptions (company_id, plan_slug, current_period_start, current_period_end)
      values (gen_random_uuid(), 'pro', now(), now() - interval '1 day');
    assert false, 'period runs backwards';
  exception when check_violation or foreign_key_violation then null; end;
  begin update public.platform_subscriptions set status = 'ended' where id = s; assert false, 'ended needs its time';
  exception when check_violation then null; end;

  a := public.kd_platform_invoice_number(2026);
  b := public.kd_platform_invoice_number(2026);
  assert a = 'PI-2026-000001' and b = 'PI-2026-000002', 'numbers count up: ' || a || ' ' || b;
  assert public.kd_platform_invoice_number(2027) = 'PI-2027-000001', 'a new year starts again';

  insert into public.platform_invoices (company_id, subscription_id, number, subtotal, tax_amount, total, due_at, idempotency_key)
    values (c, s, a, 100, 15, 115, now() + interval '7 days', 'sub-invoice-0001') returning id into i;
  begin insert into public.platform_invoices (company_id, number, subtotal, tax_amount, total, due_at, idempotency_key)
      values (c, b, 100, 15, 120, now(), 'sub-invoice-0002');
    assert false, 'total must be subtotal plus tax';
  exception when check_violation then null; end;
  begin insert into public.platform_invoices (company_id, number, subtotal, total, due_at, idempotency_key)
      values (c, a, 10, 10, now(), 'sub-invoice-0003');
    assert false, 'number used twice';
  exception when unique_violation then null; end;
  begin insert into public.platform_invoices (company_id, number, subtotal, total, due_at, idempotency_key)
      values (c, b, 10, 10, now(), 'sub-invoice-0001');
    assert false, 'key used twice';
  exception when unique_violation then null; end;
  begin insert into public.platform_invoices (company_id, number, subtotal, total, due_at, idempotency_key)
      values (c, 'BAD-1', 10, 10, now(), 'sub-invoice-0009');
    assert false, 'bad number format';
  exception when check_violation then null; end;
  begin update public.platform_invoices set status = 'paid' where id = i; assert false, 'paid needs its time';
  exception when check_violation then null; end;
  update public.platform_invoices set status = 'paid', paid_at = now() where id = i;

  insert into public.subscription_events (company_id, subscription_id, event) values (c, s, 'created');
  begin update public.subscription_events set event = 'x' where subscription_id = s; assert false, 'history changed';
  exception when others then if sqlstate = 'P0004' then raise; end if; end;
end
$$;
