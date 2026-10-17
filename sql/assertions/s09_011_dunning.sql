-- path: sql/assertions/s09_011_dunning.sql
-- Reminders are logged once per step, the log is append only, a promise needs a date, late fees are one per period,
-- a write-off closes the balance and cannot exceed it.
do $$
declare
  c uuid; cl uuid; inv uuid; r record; w uuid;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Dun Co', 'dun-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, due_date, issue_date)
    values (c, cl, bill, 500, 500, 'overdue', 'INV-1', current_date - 20, current_date - 50) returning id into inv;

  insert into public.reminder_settings (company_id) values (c);
  begin insert into public.reminder_settings (company_id) values (c); assert false, 'one settings row per company';
  exception when unique_violation then null; end;
  insert into public.reminder_log (company_id, invoice_id, step_key, offset_days, status) values (c, inv, '7', 7, 'sent');
  begin insert into public.reminder_log (company_id, invoice_id, step_key, offset_days, status) values (c, inv, '7', 7, 'sent'); assert false, 'a step is sent once';
  exception when unique_violation then null; end;
  begin update public.reminder_log set status = 'failed' where invoice_id = inv; assert false, 'log is append only';
  exception when insufficient_privilege then null; end;
  begin insert into public.reminder_holds (company_id, invoice_id, kind) values (c, inv, 'promise'); assert false, 'a promise needs a date';
  exception when check_violation then null; end;
  insert into public.reminder_holds (company_id, invoice_id, kind, until_date) values (c, inv, 'promise', current_date + 5);

  insert into public.late_fees (company_id, invoice_id, period_key, amount) values (c, inv, 'm1', 25);
  begin insert into public.late_fees (company_id, invoice_id, period_key, amount) values (c, inv, 'm1', 25); assert false, 'one fee per period';
  exception when unique_violation then null; end;
  begin insert into public.late_fee_settings (company_id, kind, cap_percent) values (c, 'percent', 150); assert false, 'cap is a percentage';
  exception when check_violation then null; end;

  begin perform public.kd_invoice_writeoff(c, inv, 600, 'Client has closed down', null); assert false, 'more than the balance';
  exception when sqlstate '22023' then null; end;
  begin insert into public.invoice_writeoffs (company_id, invoice_id, amount, reason, created_by) values (c, inv, 5, 'short', gen_random_uuid()); assert false, 'a reason is needed';
  exception when check_violation then null; end;
  select * into r from public.kd_invoice_writeoff(c, inv, 200, 'Client has closed down, partial recovery', gen_random_uuid());
  assert r.invoice_status = 'partially_paid' and r.balance = 300, 'partial write-off';
  select * into r from public.kd_invoice_writeoff(c, inv, 300, 'Client has closed down, rest', gen_random_uuid());
  assert r.invoice_status = 'paid' and r.balance = 0, 'full write-off closes the invoice';
  assert (select sum(amount) from public.credit_applications where invoice_id = inv and source_type = 'write_off') = 500, 'write-offs are recorded as settlements';
  begin perform public.kd_invoice_writeoff(c, inv, 1, 'Nothing left to write off', gen_random_uuid()); assert false, 'a paid invoice cannot be written off';
  exception when sqlstate '22023' then null; end;
end
$$;
