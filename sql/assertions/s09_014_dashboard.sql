-- path: sql/assertions/s09_014_dashboard.sql
-- Dashboard numbers: invoiced and collected in a range, credits are not cash, write-offs are apart, aging buckets,
-- one layout per person, other companies are never counted.
do $$
declare
  c uuid; c2 uuid; cl uuid; a uuid; b uuid; s jsonb; series jsonb;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Dash Co', 'dash-co') returning id into c;
  insert into public.companies (name, slug) values ('Dash Two', 'dash-two') returning id into c2;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, sent_at, due_date, issue_date)
    values (c, cl, bill, 1000, 1000, 'sent', 'INV-1', now(), current_date + 10, current_date) returning id into a;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, sent_at, due_date, issue_date)
    values (c, cl, bill, 500, 500, 'overdue', 'INV-2', now(), current_date - 45, current_date - 60) returning id into b;
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due, status) values (c, 'Draft', bill, 70, 70, 'draft');
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due, status, sent_at, number) values (c2, 'Other', bill, 9999, 9999, 'sent', now(), 'X-1');

  perform public.kd_invoice_apply_payment(a, gen_random_uuid(), 300);
  perform * from public.kd_invoice_writeoff(c, b, 100, 'Client closed, partial recovery', gen_random_uuid());
  perform * from public.kd_invoice_mark_overdue(current_date);

  s := public.kd_dashboard_stats(c, date_trunc('month', current_date)::date, current_date, current_date);
  assert (s ->> 'invoiced')::numeric = 1500, 'invoiced: ' || (s ->> 'invoiced');
  assert (s ->> 'invoicedCount')::int = 2, 'invoiced count';
  assert (s ->> 'collected')::numeric = 300, 'cash only, not write-offs: ' || (s ->> 'collected');
  assert (s ->> 'writtenOff')::numeric = 100, 'write-offs apart';
  assert (s ->> 'outstanding')::numeric = 1100, 'outstanding: ' || (s ->> 'outstanding');
  assert (s ->> 'overdue')::numeric = 400, 'overdue amount';
  assert (s ->> 'drafts')::int = 1, 'drafts';
  assert (s -> 'aging' ->> 'current')::numeric = 700, 'not yet due';
  assert (s -> 'aging' ->> 'd31_60')::numeric = 400, '31 to 60 days late';
  assert (s -> 'aging' ->> 'd90_plus')::numeric = 0, 'nothing very old';
  assert (s -> 'statuses' ->> 'draft')::int = 1, 'status counts';

  series := public.kd_dashboard_series(c, current_date, 3);
  assert jsonb_array_length(series) = 3, 'three months';
  assert (series -> 2 ->> 'invoiced')::numeric = 1500 and (series -> 2 ->> 'collected')::numeric = 300, 'this month in the series';
  assert (series -> 0 ->> 'invoiced')::numeric = 0, 'earlier months are empty';
  assert jsonb_array_length(public.kd_dashboard_series(c, current_date, 500)) = 36, 'at most 36 months';

  insert into public.dashboard_layouts (company_id, user_id, widgets) values (c, gen_random_uuid(), '[]');
  declare u uuid := gen_random_uuid();
  begin
    insert into public.dashboard_layouts (company_id, user_id, widgets) values (c, u, '[{"id":"cards","visible":true}]');
    begin insert into public.dashboard_layouts (company_id, user_id, widgets) values (c, u, '[]'); assert false, 'one layout per person';
    exception when unique_violation then null; end;
    begin insert into public.dashboard_layouts (company_id, user_id, widgets) values (c, gen_random_uuid(), '{}'); assert false, 'widgets are a list';
    exception when check_violation then null; end;
  end;
end
$$;
