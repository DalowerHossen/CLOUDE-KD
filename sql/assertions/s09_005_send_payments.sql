-- path: sql/assertions/s09_005_send_payments.sql
-- Send, apply payment, overdue sweep.
do $$
declare
  c uuid; cl uuid; a uuid; b uuid; z uuid; r record; pay uuid := gen_random_uuid(); n integer;
begin
  insert into public.companies (name, slug) values ('Send Co', 'send-co') returning id into c;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Buyer', '10001', 'US') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, subtotal, net_total)
    values (c, cl, '{"name":"Buyer","postalCode":"10001","country":"US"}', 100, 100, 100, 100) returning id into a;
  begin perform * from public.kd_invoice_send(c, a, 'INV-', false, 4, 1, 2026, '{"name":"Send Co"}', null, null); assert false, 'no lines';
  exception when sqlstate '22023' then null; end;
  insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price, line_total) values (c, a, 1, 'Work', 1, 100, 100);
  select * into r from public.kd_invoice_send(c, a, 'INV-', false, 4, 1, 2026, '{"name":"Send Co"}', null, null);
  assert r.number = 'INV-0001' and r.status = 'sent', 'sent with a number';
  assert (select seller ->> 'name' from public.invoices where id = a) = 'Send Co' and (select sent_at is not null from public.invoices where id = a);
  begin perform * from public.kd_invoice_send(c, a, 'INV-', false, 4, 1, 2026, '{}', null, null); assert false, 'cannot send twice';
  exception when sqlstate '22023' then null; end;

  -- billing details are required
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due) values (c, 'Walk', '{"name":"Walk"}', 5, 5) returning id into b;
  insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price) values (c, b, 1, 'x', 1, 5);
  begin perform * from public.kd_invoice_send(c, b, 'INV-', false, 4, 1, 2026, '{}', null, null); assert false, 'billing postal code and country needed';
  exception when sqlstate '22023' then null; end;
  update public.invoices set bill_to = '{"name":"Walk","postalCode":"1","country":"US"}' where id = b;
  -- zero invoice is paid at once
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due) values (c, 'Zero', '{"name":"Zero","postalCode":"1","country":"US"}', 0, 0) returning id into z;
  insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price) values (c, z, 1, 'Free', 1, 0);
  select * into r from public.kd_invoice_send(c, z, 'INV-', false, 4, 1, 2026, '{}', null, null);
  assert r.status = 'paid' and r.number = 'INV-0002', 'a zero invoice is paid at send';
  -- negative total refused
  update public.invoices set total = -5, amount_due = -5 where id = b;
  begin perform * from public.kd_invoice_send(c, b, 'INV-', false, 4, 1, 2026, '{}', null, null); assert false, 'no negative invoices';
  exception when sqlstate '22023' then null; end;

  -- payments
  select * into r from public.kd_invoice_apply_payment(a, pay, 40);
  assert r.status = 'partially_paid' and r.amount_paid = 40 and r.balance = 60 and not r.replayed;
  select * into r from public.kd_invoice_apply_payment(a, pay, 40);
  assert r.replayed and r.amount_paid = 40, 'the same payment applies once';
  begin perform * from public.kd_invoice_apply_payment(a, gen_random_uuid(), 61); assert false, 'more than the balance';
  exception when sqlstate '22023' then null; end;
  begin perform * from public.kd_invoice_apply_payment(a, gen_random_uuid(), 0); assert false, 'amount above zero';
  exception when sqlstate '22023' then null; end;
  select * into r from public.kd_invoice_apply_payment(a, gen_random_uuid(), 60);
  assert r.status = 'paid' and r.balance = 0, 'fully paid';
  assert (select paid_at is not null from public.invoices where id = a);
  begin perform * from public.kd_invoice_apply_payment(a, gen_random_uuid(), 1); assert false, 'a paid invoice takes no more';
  exception when sqlstate '22023' then null; end;
  begin perform * from public.kd_invoice_apply_payment(gen_random_uuid(), gen_random_uuid(), 1); assert false, 'unknown invoice';
  exception when sqlstate '22023' then null; end;

  -- overdue sweep
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due, status, issue_date, due_date, number)
    values (c, 'Late', '{}', 50, 50, 'sent', current_date - 40, current_date - 10, 'INV-9001') returning id into b;
  insert into public.invoices (company_id, walk_in_name, bill_to, total, amount_due, status, issue_date, due_date, number)
    values (c, 'Future', '{}', 50, 50, 'sent', current_date, current_date + 10, 'INV-9002');
  select count(*) into n from public.kd_invoice_mark_overdue(current_date);
  assert n = 1, 'only the late one: ' || n;
  assert (select status from public.invoices where id = b) = 'overdue';
  select * into r from public.kd_invoice_apply_payment(b, gen_random_uuid(), 10);
  assert r.status = 'partially_paid', 'a payment on an overdue invoice';
end
$$;
