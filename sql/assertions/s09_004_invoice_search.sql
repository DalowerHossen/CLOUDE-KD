-- path: sql/assertions/s09_004_invoice_search.sql
-- Invoice search: text, amount, status, date range, client, sorting, keyset pages, trash, company scope.
do $$
declare
  c uuid; c2 uuid; cl uuid; cl2 uuid; n integer; first_id uuid; v text; i1 uuid;
begin
  insert into public.companies (name, slug) values ('Find Co', 'find-co') returning id into c;
  insert into public.companies (name, slug) values ('Find Two', 'find-two') returning id into c2;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Northwind Traders', '1', 'US') returning id into cl;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Contoso Ltd', '2', 'US') returning id into cl2;
  insert into public.invoices (company_id, client_id, number, status, issue_date, due_date, total, amount_due, bill_to, po_number)
    values (c, cl, 'INV-0001', 'sent', '2026-01-10', '2026-02-10', 100, 100, '{"name":"Northwind Traders"}', 'PO-77') returning id into i1;
  insert into public.invoices (company_id, client_id, number, status, issue_date, due_date, total, amount_due, bill_to)
    values (c, cl, 'INV-0002', 'paid', '2026-02-10', '2026-03-10', 250.5, 250.5, '{"name":"Northwind Traders"}');
  insert into public.invoices (company_id, client_id, number, status, issue_date, due_date, total, amount_due, bill_to)
    values (c, cl2, 'INV-0003', 'overdue', '2026-03-10', '2026-04-10', 75, 75, '{"name":"Contoso Ltd"}');
  insert into public.invoices (company_id, walk_in_name, status, total, amount_due) values (c, 'Walk-in Wendy', 'draft', 10, 10);
  insert into public.invoices (company_id, walk_in_name, status, number, total, amount_due) values (c2, 'Secret', 'sent', 'INV-0001', 5, 5);

  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 4, 'all live invoices of the company, none of the other: ' || n;
  select count(*) into n from public.kd_invoice_search(c, 'inv-0002', null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 1, 'by number';
  select count(*) into n from public.kd_invoice_search(c, 'northwnd', null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 2, 'by client name with a typo: ' || n;
  select count(*) into n from public.kd_invoice_search(c, 'PO-77', null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 1, 'by purchase order number';
  select count(*) into n from public.kd_invoice_search(c, '250.5', null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 1, 'by amount';
  select count(*) into n from public.kd_invoice_search(c, null, array['sent', 'paid'], null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 2, 'by status';
  select count(*) into n from public.kd_invoice_search(c, null, null, null, cl2, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 1, 'by client';
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, '2026-02-01', '2026-02-28', null, null, false, 'issue', true, null, null, 26);
  assert n = 1, 'by date range';
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, 80, 200, false, 'issue', true, null, null, 26);
  assert n = 1, 'by amount range';

  select id into first_id from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'amount', true, null, null, 26) limit 1;
  assert (select total from public.invoices where id = first_id) = 250.5, 'sorted by amount, highest first';
  select id into first_id from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'client', false, null, null, 26) limit 1;
  assert (select bill_to ->> 'name' from public.invoices where id = first_id) = 'Contoso Ltd', 'sorted by client';

  -- keyset pages of two
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'issue', true, null, null, 2);
  assert n = 2;
  select id, sort_value into first_id, v from (select * from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'issue', true, null, null, 2) offset 1) x;
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'issue', true, v, first_id, 26);
  assert n = 2, 'the next page continues after the cursor: ' || n;

  -- trash
  update public.invoices set status = 'void', voided_at = now() where id = i1 and false;
  delete from public.invoices where company_id = c and status = 'draft';
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 3, 'trashed drafts leave the list';
  select count(*) into n from public.kd_invoice_search(c, null, null, null, null, null, null, null, null, true, 'issue', true, null, null, 26);
  assert n = 1, 'and show in the trash';
  select count(*) into n from public.kd_invoice_search(c2, 'northwind', null, null, null, null, null, null, null, false, 'issue', true, null, null, 26);
  assert n = 0, 'another company finds nothing';
end
$$;
