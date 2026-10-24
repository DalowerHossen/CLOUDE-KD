-- path: sql/assertions/s10_004_payment_reports.sql
-- Payment report and gateway health: grouped by day and status, limited to one company, money kept exact.
do $$
declare
  c1 uuid; c2 uuid; cl1 uuid; cl2 uuid; i1 uuid; i2 uuid; i3 uuid; p1 uuid; n integer; r record; total numeric;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Rep One', 'rep-one') returning id into c1;
  insert into public.companies (name, slug) values ('Rep Two', 'rep-two') returning id into c2;
  insert into public.clients (company_id, name) values (c1, 'B1') returning id into cl1;
  insert into public.clients (company_id, name) values (c2, 'B2') returning id into cl2;
  insert into public.invoices (company_id, client_id, bill_to) values (c1, cl1, bill) returning id into i1;
  insert into public.invoices (company_id, client_id, bill_to) values (c1, cl1, bill) returning id into i2;
  insert into public.invoices (company_id, client_id, bill_to) values (c2, cl2, bill) returning id into i3;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key, status, captured_amount) values (c1, i1, cl1, 'stripe', 100.1234, 'idem-rep-00001', 'created', 0) returning id into p1;
  update public.payments set status = 'authorized' where id = p1;
  update public.payments set status = 'captured', captured_amount = 100.1234 where id = p1;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key, status) values (c1, i2, cl1, 'stripe', 50, 'idem-rep-00002', 'failed');
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key, status) values (c2, i3, cl2, 'stripe', 999, 'idem-rep-00003', 'failed');

  select coalesce(sum(payment_count), 0) into n from public.kd_payment_report(c1, now() - interval '1 day', now() + interval '1 day');
  assert n = 2, 'only the company payments: ' || n;
  select coalesce(sum(captured), 0) into total from public.kd_payment_report(c1, now() - interval '1 day', now() + interval '1 day');
  assert total = 100.1234, 'money stays exact: ' || total;
  select coalesce(sum(payment_count), 0) into n from public.kd_payment_report(c1, now() + interval '1 day', now() + interval '2 days');
  assert n = 0, 'outside the period';
  select count(*) into n from public.kd_payment_report(c1, now() - interval '1 day', now() + interval '1 day') where status = 'captured';
  assert n = 1, 'grouped by status';

  insert into public.payment_attempts (company_id, payment_id, invoice_id, processor_id, action, outcome, decline_category) values
    (c1, p1, i1, 'stripe', 'authorize', 'authorized', null),
    (c1, p1, i1, 'stripe', 'authorize', 'declined', 'invalid_cvv'),
    (c1, p1, i1, 'stripe', 'authorize', 'declined', 'invalid_cvv'),
    (c1, p1, i1, 'stripe', 'refund', 'refunded', null);
  select attempt_count into n from public.kd_gateway_health(now() - interval '1 hour') where processor_id = 'stripe' and outcome = 'declined' and decline_category = 'invalid_cvv';
  assert n = 2, 'declines by category: ' || n;
  select count(*) into n from public.kd_gateway_health(now() - interval '1 hour') where outcome = 'refunded';
  assert n = 0, 'refund rows are not gateway attempts';
end
$$;
