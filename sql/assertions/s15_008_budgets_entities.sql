-- path: sql/assertions/s15_008_budgets_entities.sql
-- Budgets: RLS on; lines only for revenue and expense accounts, in the budget year, of a draft budget; the status moves one way;
-- one approved budget per year; a locked budget does not change; an alert is recorded once and never changed. Entities: a company
-- is in a group once; a pair needs accounts of its own companies that mirror each other.
do $$
declare
  c uuid; d uuid; rev uuid; exp uuid; bank uuid; b uuid; b2 uuid; g uuid; ra uuid; rb uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('budgets', 'budget_lines', 'budget_alerts', 'forecast_settings', 'entity_groups', 'entity_group_members', 'intercompany_pairs') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Budget Co', 'budget-co') returning id into c;
  insert into public.companies (name, slug) values ('Budget Sub', 'budget-sub') returning id into d;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4000', 'Sales', 'revenue', 'operating_revenue') returning id into rev;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '6000', 'Rent', 'expense', 'operating_expense') returning id into exp;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1000', 'Bank', 'asset', 'current_asset') returning id into bank;

  begin insert into public.budgets (company_id, name, fiscal_year_start) values (c, 'Bad', date '2026-01-15'); assert false, 'first of month';
  exception when check_violation then null; end;
  insert into public.budgets (company_id, name, fiscal_year_start) values (c, 'FY26', date '2026-01-01') returning id into b;
  insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, exp, date '2026-01-01', 1000);
  begin insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, exp, date '2026-01-01', 5); assert false, 'one cell once';
  exception when unique_violation then null; end;
  begin insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, bank, date '2026-02-01', 5); assert false, 'revenue and expense only';
  exception when invalid_parameter_value then null; end;
  begin insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, exp, date '2027-01-01', 5); assert false, 'month outside the year';
  exception when invalid_parameter_value then null; end;
  begin insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, exp, date '2026-02-01', -5); assert false, 'negative amount';
  exception when check_violation then null; end;
  begin update public.budgets set status = 'approved', approved_at = now() where id = b; assert false, 'draft must be submitted first';
  exception when object_not_in_prerequisite_state then null; end;
  update public.budgets set status = 'pending_approval' where id = b;
  begin insert into public.budget_lines (company_id, budget_id, account_id, month, amount) values (c, b, rev, date '2026-02-01', 5); assert false, 'only a draft changes';
  exception when object_not_in_prerequisite_state then null; end;
  update public.budgets set status = 'approved', approved_at = now() where id = b;
  insert into public.budgets (company_id, name, fiscal_year_start) values (c, 'Other', date '2026-01-01') returning id into b2;
  update public.budgets set status = 'pending_approval' where id = b2;
  begin update public.budgets set status = 'approved', approved_at = now() where id = b2; assert false, 'one live budget per year';
  exception when unique_violation then null; end;
  update public.budgets set status = 'locked' where id = b;
  begin update public.budgets set name = 'x' where id = b; assert false, 'locked budget';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.budgets set status = 'approved' where id = b; assert false, 'locked is final';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.budget_alerts (company_id, budget_id, account_id, month, level, used_percent) values (c, b, exp, date '2026-01-01', 80, 85);
  begin insert into public.budget_alerts (company_id, budget_id, account_id, month, level, used_percent) values (c, b, exp, date '2026-01-01', 80, 90); assert false, 'alert once';
  exception when unique_violation then null; end;
  begin insert into public.budget_alerts (company_id, budget_id, account_id, month, level, used_percent) values (c, b, exp, date '2026-01-01', 50, 90); assert false, 'level 80 or 100';
  exception when check_violation then null; end;
  begin update public.budget_alerts set used_percent = 1 where budget_id = b; assert false, 'append only';
  exception when insufficient_privilege then null; end;

  insert into public.forecast_settings (company_id, low_cash_threshold) values (c, 500);
  begin insert into public.forecast_settings (company_id) values (c); assert false, 'one settings row';
  exception when unique_violation then null; end;

  insert into public.entity_groups (company_id, name) values (c, 'Group') returning id into g;
  begin insert into public.entity_groups (company_id, name) values (c, 'Second'); assert false, 'one group per company';
  exception when unique_violation then null; end;
  begin insert into public.entity_group_members (company_id, group_id, member_company_id) values (c, g, c); assert false, 'not itself';
  exception when check_violation then null; end;
  begin insert into public.entity_group_members (company_id, group_id, member_company_id, ownership_percent) values (c, g, d, 0); assert false, 'share above zero';
  exception when check_violation then null; end;
  insert into public.entity_group_members (company_id, group_id, member_company_id, ownership_percent) values (c, g, d, 80);
  begin insert into public.entity_group_members (company_id, group_id, member_company_id) values (c, g, d); assert false, 'member once';
  exception when unique_violation then null; end;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1300', 'Due from sub', 'asset', 'current_asset') returning id into ra;
  insert into public.accounts (company_id, code, name, type, subtype) values (d, '2300', 'Due to parent', 'liability', 'current_liability') returning id into rb;
  insert into public.intercompany_pairs (company_id, group_id, label, company_a, account_a, company_b, account_b) values (c, g, 'Loan', c, ra, d, rb);
  begin insert into public.intercompany_pairs (company_id, group_id, label, company_a, account_a, company_b, account_b) values (c, g, 'Bad', c, rb, d, ra); assert false, 'account of its own company';
  exception when no_data_found then null; end;
  begin insert into public.intercompany_pairs (company_id, group_id, label, company_a, account_a, company_b, account_b) values (c, g, 'Same', c, ra, c, ra); assert false, 'two companies';
  exception when check_violation then null; end;
end
$$;
