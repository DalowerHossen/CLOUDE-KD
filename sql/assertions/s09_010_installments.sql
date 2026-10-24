-- path: sql/assertions/s09_010_installments.sql
-- Installment plans: the parts must add up to the amount due, dates in order, replacing a plan keeps one active plan,
-- and the overdue sweep also looks at parts that are past their date and not covered.
do $$
declare
  c uuid; cl uuid; inv uuid; plan uuid; n integer;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Inst Co', 'inst-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, issue_date, due_date)
    values (c, cl, bill, 300, 300, 'sent', 'INV-1', current_date - 60, current_date + 60) returning id into inv;

  begin perform public.kd_installments_replace(c, inv, '[{"dueDate":"2030-01-01","amount":"100"}]', null); assert false, 'two parts at least';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_installments_replace(c, inv, format('[{"dueDate":"%s","amount":"100"},{"dueDate":"%s","amount":"100"}]', current_date, current_date + 30)::jsonb, null); assert false, 'must add up';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_installments_replace(c, inv, format('[{"dueDate":"%s","amount":"150"},{"dueDate":"%s","amount":"150"}]', current_date + 30, current_date)::jsonb, null); assert false, 'dates in order';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_installments_replace(c, inv, format('[{"dueDate":"%s","amount":"0"},{"dueDate":"%s","amount":"300"}]', current_date, current_date + 30)::jsonb, null); assert false, 'parts above zero';
  exception when sqlstate '22023' then null; end;

  plan := public.kd_installments_replace(c, inv, format('[{"dueDate":"%s","amount":"100"},{"dueDate":"%s","amount":"100"},{"dueDate":"%s","amount":"100"}]', current_date - 30, current_date + 30, current_date + 60)::jsonb, null);
  assert (select count(*) from public.installments where plan_id = plan and deleted_at is null) = 3, 'three parts';

  -- the first part is past its date and nothing is paid: overdue, although the invoice due date is far away
  select count(*) into n from public.kd_invoice_mark_overdue(current_date);
  assert n = 1 and (select status from public.invoices where id = inv) = 'overdue', 'a missed part makes the invoice overdue';

  -- a replaced plan leaves one active plan
  plan := public.kd_installments_replace(c, inv, format('[{"dueDate":"%s","amount":"150"},{"dueDate":"%s","amount":"150"}]', current_date + 5, current_date + 35)::jsonb, null);
  assert (select count(*) from public.installment_plans where invoice_id = inv and status = 'active' and deleted_at is null) = 1, 'one active plan';
  assert (select count(*) from public.installments where invoice_id = inv and deleted_at is null) = 2, 'old parts are gone';

  -- a covered part is not late
  update public.invoices set status = 'sent', amount_paid = 150 where id = inv;
  update public.installments set due_date = current_date - 2 where invoice_id = inv and number = 1 and deleted_at is null;
  select count(*) into n from public.kd_invoice_mark_overdue(current_date);
  assert n = 0, 'a part that is covered by payments is not overdue';
  update public.invoices set amount_paid = 100, status = 'sent' where id = inv;
  select count(*) into n from public.kd_invoice_mark_overdue(current_date);
  assert n = 1, 'a part that is only partly covered is overdue';
end
$$;
