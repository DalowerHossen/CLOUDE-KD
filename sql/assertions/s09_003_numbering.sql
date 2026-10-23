-- path: sql/assertions/s09_003_numbering.sql
-- Numbering: sequence, start value, yearly reset, separate series, manual numbers, refusals.
do $$
declare
  c uuid; c2 uuid; cl uuid; a uuid; b uuid; d uuid; e uuid; r text;
begin
  insert into public.companies (name, slug) values ('Num Co', 'num-co') returning id into c;
  insert into public.companies (name, slug) values ('Num Two', 'num-two') returning id into c2;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'B', '1', 'US') returning id into cl;
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into a;
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into b;
  insert into public.invoices (company_id, client_id, kind) values (c, cl, 'debit_note') returning id into d;
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into e;

  r := public.kd_invoice_assign_number(c, a, 'INV-', false, 4, 1000, 2026, null);
  assert r = 'INV-1000', 'starts at the chosen value: ' || r;
  r := public.kd_invoice_assign_number(c, b, 'INV-', false, 4, 1000, 2026, null);
  assert r = 'INV-1001', 'next value: ' || r;
  assert public.kd_peek_doc_number(c, 'INV', 0, 1000) = 1002, 'peek does not take a number';
  r := public.kd_invoice_assign_number(c, d, 'DN-', false, 4, 1, 2026, null);
  assert r = 'DN-0001', 'a separate series: ' || r;
  begin perform public.kd_invoice_assign_number(c, a, 'INV-', false, 4, 1, 2026, null); assert false, 'already numbered';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_invoice_assign_number(c2, e, 'INV-', false, 4, 1, 2026, null); assert false, 'another company';
  exception when sqlstate '22023' then null; end;
  r := public.kd_invoice_assign_number(c, e, 'X-', false, 3, 1, 2026, 'CUSTOM-7');
  assert r = 'CUSTOM-7', 'manual number';
  assert public.kd_peek_doc_number(c, 'INV', 0, 1000) = 1002, 'a manual number uses no counter value';
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into e;
  begin perform public.kd_invoice_assign_number(c, e, 'X-', false, 3, 1, 2026, 'CUSTOM-7'); assert false, 'manual number must be unique';
  exception when unique_violation then null; end;
  assert (select number is null from public.invoices where id = e), 'a refused number leaves the invoice without one';
  update public.invoices set status = 'sent', seller = '{}' where id = e;
  begin perform public.kd_invoice_assign_number(c, e, 'INV-', false, 4, 1, 2026, 'LATE'); assert false, 'no manual number once sent';
  exception when sqlstate '22023' then null; end;

  -- yearly series reset: a new year starts again at 1, the first number of the company uses the start value
  insert into public.invoices (company_id, walk_in_name) values (c2, 'W1') returning id into a;
  insert into public.invoices (company_id, walk_in_name) values (c2, 'W2') returning id into b;
  insert into public.invoices (company_id, walk_in_name) values (c2, 'W3') returning id into d;
  r := public.kd_invoice_assign_number(c2, a, 'INV-', true, 4, 5, 2026, null);
  assert r = 'INV-2026-0005', 'yearly: ' || r;
  r := public.kd_invoice_assign_number(c2, b, 'INV-', true, 4, 5, 2027, null);
  assert r = 'INV-2027-0001', 'a new year starts at one: ' || r;
  r := public.kd_invoice_assign_number(c2, d, 'INV-', true, 4, 5, 2026, null);
  assert r = 'INV-2026-0006', 'the old year goes on: ' || r;
  assert not exists (select 1 from public.invoice_sequences where company_id = c and year <> 0), 'sequential series use year 0';
end
$$;
