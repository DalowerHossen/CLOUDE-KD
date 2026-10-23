-- path: sql/assertions/s15_010_payroll_people.sql
-- Payroll people tables: RLS on; employee numbers EMP-0001 per company and never changed; email once among current employees; a
-- terminated employee needs an end date; grade and structure of the same company only; a component code once, a deduction only
-- may be pre-tax; one settings row; bracket rows only under bracket rules; a lower bound once per rule.
do $$
declare
  c uuid; d uuid; g uuid; s uuid; comp uuid; e1 uuid; e2 uuid; r1 uuid; r2 uuid; n integer; num text; gd uuid;
begin
  select count(*) into n from pg_class x join pg_namespace sc on sc.oid = x.relnamespace
    where sc.nspname = 'public' and x.relname in ('payroll_settings', 'salary_grades', 'salary_components', 'salary_structures', 'salary_structure_items', 'employees', 'employee_documents', 'payroll_tax_rules', 'payroll_tax_brackets') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Pay Co', 'pay-co') returning id into c;
  insert into public.companies (name, slug) values ('Pay Other', 'pay-other') returning id into d;

  insert into public.payroll_settings (company_id) values (c);
  begin insert into public.payroll_settings (company_id) values (c); assert false, 'one settings row';
  exception when unique_violation then null; end;
  begin insert into public.payroll_settings (company_id, overtime_multiplier) values (d, 0.5); assert false, 'multiplier at least 1';
  exception when check_violation then null; end;

  insert into public.salary_grades (company_id, name, min_amount, max_amount) values (c, 'A', 1000, 3000) returning id into g;
  insert into public.salary_grades (company_id, name, min_amount, max_amount) values (d, 'A', 1000, 3000) returning id into gd;
  begin insert into public.salary_grades (company_id, name, min_amount, max_amount) values (c, 'a', 1, 2); assert false, 'grade name once';
  exception when unique_violation then null; end;
  begin insert into public.salary_grades (company_id, name, min_amount, max_amount) values (c, 'Bad', 5, 2); assert false, 'range order';
  exception when check_violation then null; end;

  insert into public.salary_structures (company_id, name, grade_id) values (c, 'Office', g) returning id into s;
  begin insert into public.salary_structures (company_id, name, grade_id) values (c, 'Other grade', gd); assert false, 'grade of another company';
  exception when no_data_found then null; end;
  insert into public.salary_components (company_id, code, name, kind, calc_type, default_value) values (c, 'HRA', 'Housing', 'earning', 'percent_of_basic', 20) returning id into comp;
  begin insert into public.salary_components (company_id, code, name, kind) values (c, 'hra', 'x', 'earning'); assert false, 'code upper case';
  exception when check_violation then null; end;
  begin insert into public.salary_components (company_id, code, name, kind) values (c, 'HRA', 'x', 'earning'); assert false, 'code once';
  exception when unique_violation then null; end;
  begin insert into public.salary_components (company_id, code, name, kind, pre_tax) values (c, 'PRE', 'x', 'earning', true); assert false, 'only a deduction is pre-tax';
  exception when check_violation then null; end;
  begin insert into public.salary_components (company_id, code, name, kind, calc_type) values (c, 'PG', 'x', 'earning', 'percent_of_gross'); assert false, 'percent of gross is for deductions';
  exception when check_violation then null; end;
  begin insert into public.salary_components (company_id, code, name, kind, calc_type, default_value) values (c, 'BIG', 'x', 'earning', 'percent_of_basic', 150); assert false, 'percent up to 100';
  exception when check_violation then null; end;
  insert into public.salary_structure_items (company_id, structure_id, component_id, value) values (c, s, comp, 25);
  begin insert into public.salary_structure_items (company_id, structure_id, component_id, value) values (c, s, comp, 30); assert false, 'component once per structure';
  exception when unique_violation then null; end;

  insert into public.employees (company_id, first_name, last_name, email, join_date, grade_id, structure_id) values (c, 'Ann', 'Lee', 'ann@example.com', date '2026-01-05', g, s) returning id into e1;
  select employee_number into num from public.employees where id = e1;
  assert num = 'EMP-0001', 'first number';
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Bob', 'Ray', 'bob@example.com', date '2026-02-01') returning id into e2;
  select employee_number into num from public.employees where id = e2;
  assert num = 'EMP-0002', 'second number';
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (d, 'Cy', 'Day', 'cy@example.com', date '2026-02-01');
  select employee_number into num from public.employees where company_id = d;
  assert num = 'EMP-0001', 'numbers count per company';
  begin update public.employees set employee_number = 'EMP-0099' where id = e1; assert false, 'number cannot change';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Dup', 'Ann', 'ANN@example.com', date '2026-02-01'); assert false, 'email once';
  exception when unique_violation then null; end;
  begin insert into public.employees (company_id, first_name, last_name, email, join_date, grade_id) values (c, 'X', 'Y', 'x@example.com', date '2026-02-01', gd); assert false, 'grade of another company';
  exception when no_data_found then null; end;
  begin insert into public.employees (company_id, first_name, last_name, email, join_date, end_date) values (c, 'X', 'Y', 'x2@example.com', date '2026-02-01', date '2026-01-01'); assert false, 'end before join';
  exception when check_violation then null; end;
  begin update public.employees set status = 'terminated' where id = e2; assert false, 'terminated needs an end date';
  exception when check_violation then null; end;
  update public.employees set status = 'terminated', end_date = date '2026-06-30' where id = e2;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Bob', 'Again', 'bob@example.com', date '2026-07-01');

  insert into public.payroll_tax_rules (company_id, code, name, kind, method) values (c, 'INC', 'Income tax', 'income_tax', 'bracket') returning id into r1;
  insert into public.payroll_tax_rules (company_id, code, name, kind, method, rate, wage_cap_annual) values (c, 'SS', 'Social security', 'employee_contribution', 'flat', 6.2, 168600) returning id into r2;
  begin insert into public.payroll_tax_rules (company_id, code, name, kind, method, wage_cap_annual) values (c, 'BAD', 'x', 'income_tax', 'bracket', 100); assert false, 'a cap is for flat rules';
  exception when check_violation then null; end;
  insert into public.payroll_tax_brackets (company_id, rule_id, lower_annual, rate) values (c, r1, 0, 10);
  insert into public.payroll_tax_brackets (company_id, rule_id, lower_annual, rate) values (c, r1, 11000, 12);
  begin insert into public.payroll_tax_brackets (company_id, rule_id, lower_annual, rate) values (c, r1, 11000, 15); assert false, 'bound once';
  exception when unique_violation then null; end;
  begin insert into public.payroll_tax_brackets (company_id, rule_id, lower_annual, rate) values (c, r2, 0, 10); assert false, 'brackets only under bracket rules';
  exception when no_data_found then null; end;
  begin insert into public.payroll_tax_brackets (company_id, rule_id, lower_annual, rate) values (c, r1, 5, 101); assert false, 'rate up to 100';
  exception when check_violation then null; end;
end
$$;
