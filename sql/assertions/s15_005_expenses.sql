-- path: sql/assertions/s15_005_expenses.sql
-- Expenses: RLS on; categories nest at most 4 deep and point at an expense account of the same company; an expense needs
-- total = net + tax, a rejected one needs a reason; an approved expense cannot change its amounts or be removed; a recurring
-- expense is made once per date; policies and receipts accept only valid values.
do $$
declare
  c uuid; o uuid; exp_acc uuid; asset_acc uuid; other_acc uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; e uuid; n integer; rid uuid := public.uuid_generate_v7();
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('expense_categories', 'expenses', 'receipts', 'expense_policies', 'recurring_expenses') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Expense Co', 'expense-co') returning id into c;
  insert into public.companies (name, slug) values ('Expense Other', 'expense-other') returning id into o;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '6100', 'General', 'expense', 'operating_expense') returning id into exp_acc;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1110', 'Bank', 'asset', 'current_asset') returning id into asset_acc;
  insert into public.accounts (company_id, code, name, type, subtype) values (o, '6100', 'General', 'expense', 'operating_expense') returning id into other_acc;

  insert into public.expense_categories (company_id, name, account_id) values (c, 'Travel', exp_acc) returning id into c1;
  begin insert into public.expense_categories (company_id, name) values (c, 'travel'); assert false, 'same name twice';
  exception when unique_violation then null; end;
  begin insert into public.expense_categories (company_id, name, account_id) values (c, 'Bad', asset_acc); assert false, 'a category posts to an expense account';
  exception when invalid_parameter_value then null; end;
  begin insert into public.expense_categories (company_id, name, account_id) values (c, 'Foreign', other_acc); assert false, 'account of another company';
  exception when no_data_found then null; end;
  insert into public.expense_categories (company_id, name, parent_id) values (c, 'Flights', c1) returning id into c2;
  insert into public.expense_categories (company_id, name, parent_id) values (c, 'Long haul', c2) returning id into c3;
  insert into public.expense_categories (company_id, name, parent_id) values (c, 'Business class', c3) returning id into c4;
  begin insert into public.expense_categories (company_id, name, parent_id) values (c, 'Too deep', c4) returning id into c5; assert false, 'fifth level';
  exception when invalid_parameter_value then null; end;

  insert into public.expenses (company_id, expense_date, category_id, vendor, amount_net, tax_amount, total, submitted_by)
    values (c, date '2026-10-01', c1, 'Airline', 100, 10, 110, rid) returning id into e;
  begin insert into public.expenses (company_id, expense_date, amount_net, tax_amount, total, submitted_by) values (c, date '2026-10-01', 100, 10, 120, rid); assert false, 'total must add up';
  exception when check_violation then null; end;
  begin insert into public.expenses (company_id, expense_date, amount_net, total, submitted_by, status) values (c, date '2026-10-01', 5, 5, rid, 'rejected'); assert false, 'rejected needs a reason';
  exception when check_violation then null; end;
  begin insert into public.expenses (company_id, expense_date, amount_net, total, submitted_by, payment_status) values (c, date '2026-10-01', 5, 5, rid, 'paid'); assert false, 'paid needs a time';
  exception when check_violation then null; end;
  begin insert into public.expenses (company_id, expense_date, category_id, amount_net, total, submitted_by) values (o, date '2026-10-01', c1, 5, 5, rid); assert false, 'category of another company';
  exception when no_data_found then null; end;
  update public.expenses set status = 'approved', decided_at = now() where id = e;
  begin update public.expenses set amount_net = 1, total = 11 where id = e; assert false, 'approved amounts';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.expenses where id = e; assert (select deleted_at from public.expenses where id = e) is null, 'approved expense removed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.expenses set payment_status = 'paid', paid_at = now(), paid_via = 'bank' where id = e;
  assert (select payment_status from public.expenses where id = e) = 'paid', 'payment state can change after approval';

  insert into public.recurring_expenses (company_id, name, category_id, amount_net, next_run) values (c, 'Rent', c1, 500, date '2026-11-01');
  insert into public.expenses (company_id, expense_date, amount_net, total, submitted_by, recurring_id) values (c, date '2026-11-01', 500, 500, rid, rid);
  begin insert into public.expenses (company_id, expense_date, amount_net, total, submitted_by, recurring_id) values (c, date '2026-11-01', 500, 500, rid, rid); assert false, 'one expense per recurring date';
  exception when unique_violation then null; end;
  begin insert into public.expense_policies (company_id, name, max_per_expense) values (c, 'Bad', 0); assert false, 'limit above zero';
  exception when check_violation then null; end;
  insert into public.expense_policies (company_id, name, category_id, role, max_per_expense, breach_action) values (c, 'Travel limit', c1, 'staff', 500, 'block');
  begin insert into public.receipts (company_id, file_id, name, mime_type, size_bytes, sha256) values (c, public.uuid_generate_v7(), 'a.pdf', 'application/pdf', 10, 'xyz'); assert false, 'checksum shape';
  exception when check_violation then null; end;
  insert into public.receipts (company_id, expense_id, file_id, name, mime_type, size_bytes, sha256) values (c, e, public.uuid_generate_v7(), 'a.pdf', 'application/pdf', 10, repeat('a', 64));
end
$$;
