-- path: sql/assertions/s09_002_invoices_core.sql
-- Invoices: limits, a sent invoice is immutable, lines are locked after submit, revisions and the timeline are
-- append only, numbers are unique per company and kind, payment links are unique.
do $$
declare
  c uuid; c2 uuid; cl uuid; inv uuid; inv2 uuid; item uuid; n integer;
begin
  insert into public.companies (name, slug) values ('Inv Co', 'inv-co') returning id into c;
  insert into public.companies (name, slug) values ('Inv Two', 'inv-two') returning id into c2;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Buyer', '10001', 'US') returning id into cl;

  insert into public.invoices (company_id, client_id) values (c, cl) returning id into inv;
  insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price) values (c, inv, 1, 'Work', 2, 50) returning id into item;
  begin insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price) values (c, inv, 1, 'Again', 1, 1); assert false, 'line position unique';
  exception when unique_violation then null; end;
  begin insert into public.invoices (company_id, client_id, kind) values (c, cl, 'receipt'); assert false, 'known kinds';
  exception when check_violation then null; end;
  begin insert into public.invoices (company_id, client_id, issue_date, due_date) values (c, cl, current_date, current_date - 1); assert false, 'due date not before issue date';
  exception when check_violation then null; end;
  begin insert into public.invoices (company_id, client_id, display_currency) values (c, cl, 'USD'); assert false, 'display currency is not the dollar';
  exception when check_violation then null; end;
  begin insert into public.invoices (company_id, status) values (c, 'sent'); assert false, 'a sent invoice needs a client or a walk-in name';
  exception when check_violation then null; end;
  insert into public.invoices (company_id, walk_in_name, status) values (c, 'Walk-in Wendy', 'sent') returning id into inv2;

  -- a draft is free to change
  update public.invoices set notes = 'Thanks', total = 100, subtotal = 100, amount_due = 100 where id = inv;
  update public.invoice_items set quantity = 3 where id = item;

  -- send it
  update public.invoices set status = 'sent', number = 'INV-2026-0001', sent_at = now(), seller = '{"name":"Inv Co"}' where id = inv;
  begin update public.invoices set total = 5 where id = inv; assert false, 'total is frozen';
  exception when sqlstate '42501' then null; end;
  begin update public.invoices set notes = 'Changed' where id = inv; assert false, 'client-visible notes are frozen';
  exception when sqlstate '42501' then null; end;
  begin update public.invoices set issue_date = current_date - 1 where id = inv; assert false, 'dates are frozen';
  exception when sqlstate '42501' then null; end;
  begin update public.invoices set number = 'INV-2026-0099' where id = inv; assert false, 'number is frozen';
  exception when sqlstate '42501' then null; end;
  begin update public.invoices set seller = '{"name":"Other"}' where id = inv; assert false, 'seller is frozen';
  exception when sqlstate '42501' then null; end;
  update public.invoices set internal_notes = 'call back', tags = array['vip'], category = 'retail' where id = inv;
  update public.invoices set status = 'viewed', viewed_at = now() where id = inv;
  update public.invoices set status = 'partially_paid', amount_paid = 40 where id = inv;
  begin update public.invoices set amount_paid = 500 where id = inv; assert false, 'paid cannot exceed the total';
  exception when check_violation then null; end;
  begin update public.invoice_items set quantity = 9 where id = item; assert false, 'lines are locked after send';
  exception when sqlstate '42501' then null; end;
  begin insert into public.invoice_items (company_id, invoice_id, position, description, quantity, unit_price) values (c, inv, 2, 'Late line', 1, 1); assert false, 'no new lines after send';
  exception when sqlstate '42501' then null; end;
  begin delete from public.invoices where id = inv; assert false, 'an invoice with payments cannot be deleted';
  exception when sqlstate '42501' then null; end;
  assert (select deleted_at is null from public.invoices where id = inv), 'still there';

  -- numbers are unique per company and kind
  insert into public.invoices (company_id, client_id, number, status) values (c, cl, 'INV-2026-0002', 'sent');
  begin insert into public.invoices (company_id, client_id, number, status) values (c, cl, 'INV-2026-0002', 'sent'); assert false, 'number unique';
  exception when unique_violation then null; end;
  insert into public.invoices (company_id, client_id, number, status, kind) values (c, cl, 'INV-2026-0002', 'sent', 'proforma');
  insert into public.invoices (company_id, walk_in_name, number, status) values (c2, 'Other', 'INV-2026-0002', 'sent');

  -- a voided invoice may go to the trash, a sent one may not
  begin delete from public.invoices where id = inv2; assert false, 'a sent invoice is voided, not deleted';
  exception when sqlstate '42501' then null; end;
  update public.invoices set status = 'void', voided_at = now(), void_reason = 'Mistake' where id = inv2;
  delete from public.invoices where id = inv2;
  assert (select deleted_at is not null from public.invoices where id = inv2), 'soft deleted';

  -- a draft returns to draft from approval and can go to the trash
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into inv2;
  update public.invoices set status = 'pending_approval' where id = inv2;
  begin update public.invoices set total = 7 where id = inv2; assert false, 'frozen while waiting for approval';
  exception when sqlstate '42501' then null; end;
  update public.invoices set status = 'draft', rejected_reason = 'Wrong client' where id = inv2;
  update public.invoices set total = 7 where id = inv2;
  delete from public.invoices where id = inv2;

  -- revisions and the timeline are append only
  insert into public.invoice_revisions (company_id, invoice_id, revision, snapshot) values (c, inv, 1, '{"a":1}');
  begin insert into public.invoice_revisions (company_id, invoice_id, revision, snapshot) values (c, inv, 1, '{}'); assert false, 'revision unique';
  exception when unique_violation then null; end;
  begin update public.invoice_revisions set reason = 'edit' where invoice_id = inv; assert false, 'revisions are append only';
  exception when sqlstate '42501' then null; end;
  begin delete from public.invoice_revisions where invoice_id = inv; assert false, 'revisions cannot be removed';
  exception when sqlstate '42501' then null; end;
  insert into public.invoice_events (company_id, invoice_id, kind, message) values (c, inv, 'sent', 'Invoice sent');
  begin update public.invoice_events set message = 'x' where invoice_id = inv; assert false, 'timeline append only';
  exception when sqlstate '42501' then null; end;

  -- payment links are unique per invoice and payment
  insert into public.invoice_payment_links (company_id, invoice_id, payment_id, amount) values (c, inv, gen_random_uuid(), 40);
  select count(*) into n from public.invoice_payment_links where invoice_id = inv;
  assert n = 1;
  begin insert into public.invoice_payment_links (company_id, invoice_id, payment_id, amount) values (c, inv, (select payment_id from public.invoice_payment_links where invoice_id = inv), 40); assert false, 'a payment applies once';
  exception when unique_violation then null; end;
  begin insert into public.invoice_payment_links (company_id, invoice_id, payment_id, amount) values (c, inv, gen_random_uuid(), 0); assert false, 'amount above zero';
  exception when check_violation then null; end;
end
$$;
