-- path: migrations/S15_010_payroll_people.sql
-- STEP 15.8.a Payroll: people, salary structures and payroll tax settings.
--   payroll_settings         pay frequency, overtime multiplier and cap, standard hours, rounding (one row per company).
--   salary_grades            a grade or band with a salary range.
--   salary_components        earnings and deductions (basic, allowance, bonus, insurance) with how they are calculated.
--   salary_structures        a named set of components for a pay basis (monthly, hourly or commission).
--   salary_structure_items   a component in a structure with its value.
--   employees                the people paid; pay, bank and tax identity are stored encrypted (jsonb payloads).
--   employee_documents       contracts and identity documents kept through the storage contract.
--   payroll_tax_rules        income tax and contributions the owner configures (flat or bracket; the platform ships no rates).
--   payroll_tax_brackets     the annual brackets of a bracket rule.

create table if not exists public.payroll_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  pay_frequency text not null default 'monthly' check (pay_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  overtime_multiplier numeric(7,4) not null default 1.5 check (overtime_multiplier between 1 and 5),
  overtime_cap_hours numeric(9,2) check (overtime_cap_hours is null or overtime_cap_hours >= 0),
  standard_hours_per_month numeric(7,2) not null default 160 check (standard_hours_per_month between 1 and 400),
  rounding text not null default 'cent' check (rounding in ('none', 'cent', 'dollar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.salary_grades (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  min_amount numeric(18,4) not null default 0 check (min_amount >= 0),
  max_amount numeric(18,4) not null default 0 check (max_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (max_amount >= min_amount)
);

create table if not exists public.salary_components (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('earning', 'deduction')),
  calc_type text not null default 'fixed' check (calc_type in ('fixed', 'percent_of_basic', 'percent_of_gross')),
  default_value numeric(18,4) not null default 0 check (default_value >= 0),
  taxable boolean not null default true,
  pre_tax boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kind = 'deduction' or not pre_tax),
  check (calc_type <> 'percent_of_gross' or kind = 'deduction'),
  check (calc_type = 'fixed' or default_value <= 100)
);

create table if not exists public.salary_structures (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  pay_basis text not null default 'monthly' check (pay_basis in ('monthly', 'hourly', 'commission')),
  grade_id uuid references public.salary_grades (id) on delete restrict,
  description text not null default '' check (char_length(description) <= 300),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.salary_structure_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  structure_id uuid not null references public.salary_structures (id) on delete restrict,
  component_id uuid not null references public.salary_components (id) on delete restrict,
  value numeric(18,4) not null check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.employees (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_number text check (employee_number is null or employee_number ~ '^EMP-\d{4,8}$'),
  user_id uuid,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 320),
  phone text not null default '' check (char_length(phone) <= 40),
  address text not null default '' check (char_length(address) <= 300),
  date_of_birth date,
  department text not null default '' check (char_length(department) <= 80),
  job_title text not null default '' check (char_length(job_title) <= 80),
  join_date date not null,
  end_date date,
  contract_type text not null default 'full_time' check (contract_type in ('full_time', 'part_time', 'contract', 'intern')),
  pay_basis text not null default 'monthly' check (pay_basis in ('monthly', 'hourly', 'commission')),
  grade_id uuid references public.salary_grades (id) on delete restrict,
  structure_id uuid references public.salary_structures (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  emergency_name text not null default '' check (char_length(emergency_name) <= 80),
  emergency_phone text not null default '' check (char_length(emergency_phone) <= 40),
  emergency_relation text not null default '' check (char_length(emergency_relation) <= 40),
  avatar_file_id uuid,
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  pay_enc jsonb,
  bank_enc jsonb,
  tax_enc jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date is null or end_date >= join_date),
  check ((status = 'terminated') = (end_date is not null and status = 'terminated') or status <> 'terminated')
);

create table if not exists public.employee_documents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  file_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  kind text not null default 'other' check (kind in ('contract', 'identity', 'certificate', 'other')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.payroll_tax_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('income_tax', 'employee_contribution', 'employer_contribution')),
  method text not null check (method in ('flat', 'bracket')),
  rate numeric(7,4) not null default 0 check (rate between 0 and 100),
  applies_to text not null default 'taxable' check (applies_to in ('taxable', 'gross')),
  wage_cap_annual numeric(18,4) check (wage_cap_annual is null or wage_cap_annual > 0),
  extra_threshold_annual numeric(18,4) check (extra_threshold_annual is null or extra_threshold_annual > 0),
  extra_rate numeric(7,4) not null default 0 check (extra_rate between 0 and 100),
  exemption_annual numeric(18,4) not null default 0 check (exemption_annual >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (method = 'flat' or (wage_cap_annual is null and extra_threshold_annual is null and extra_rate = 0)),
  check (kind <> 'income_tax' or method = 'bracket' or applies_to = 'taxable')
);

create table if not exists public.payroll_tax_brackets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  rule_id uuid not null references public.payroll_tax_rules (id) on delete restrict,
  lower_annual numeric(18,4) not null check (lower_annual >= 0),
  rate numeric(7,4) not null check (rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.payroll_settings');
select public.apply_standard_triggers('public.salary_grades');
select public.apply_standard_triggers('public.salary_components');
select public.apply_standard_triggers('public.salary_structures');
select public.apply_standard_triggers('public.salary_structure_items');
select public.apply_standard_triggers('public.employees');
select public.apply_standard_triggers('public.employee_documents');
select public.apply_standard_triggers('public.payroll_tax_rules');
select public.apply_standard_triggers('public.payroll_tax_brackets');
select public.rls_enable_default_deny('public.payroll_settings');
select public.rls_enable_default_deny('public.salary_grades');
select public.rls_enable_default_deny('public.salary_components');
select public.rls_enable_default_deny('public.salary_structures');
select public.rls_enable_default_deny('public.salary_structure_items');
select public.rls_enable_default_deny('public.employees');
select public.rls_enable_default_deny('public.employee_documents');
select public.rls_enable_default_deny('public.payroll_tax_rules');
select public.rls_enable_default_deny('public.payroll_tax_brackets');
select public.audit_enable_for('public.payroll_settings');
select public.audit_enable_for('public.salary_grades');
select public.audit_enable_for('public.salary_components');
select public.audit_enable_for('public.salary_structures');
select public.audit_enable_for('public.salary_structure_items');
select public.audit_enable_for('public.employees');
select public.audit_enable_for('public.employee_documents');
select public.audit_enable_for('public.payroll_tax_rules');
select public.audit_enable_for('public.payroll_tax_brackets');

create unique index if not exists uq_payroll_settings on public.payroll_settings (company_id) where deleted_at is null;
create unique index if not exists uq_salary_grades_name on public.salary_grades (company_id, lower(name)) where deleted_at is null;
create unique index if not exists uq_salary_components_code on public.salary_components (company_id, code) where deleted_at is null;
create unique index if not exists uq_salary_structures_name on public.salary_structures (company_id, lower(name)) where deleted_at is null;
create unique index if not exists uq_salary_structure_items on public.salary_structure_items (structure_id, component_id) where deleted_at is null;
create unique index if not exists uq_employees_number on public.employees (company_id, employee_number) where deleted_at is null;
create unique index if not exists uq_employees_email on public.employees (company_id, lower(email)) where deleted_at is null and status <> 'terminated';
create index if not exists ix_employees_company on public.employees (company_id, status) where deleted_at is null;
create index if not exists ix_employees_user on public.employees (user_id) where deleted_at is null and user_id is not null;
create index if not exists ix_employee_documents on public.employee_documents (employee_id) where deleted_at is null;
create unique index if not exists uq_payroll_tax_rules_code on public.payroll_tax_rules (company_id, code) where deleted_at is null;
create unique index if not exists uq_payroll_tax_brackets on public.payroll_tax_brackets (rule_id, lower_annual) where deleted_at is null;

-- The employee number EMP-0001, EMP-0002 ... per company; one writer at a time per company.
create or replace function public.kd_employee_number() returns trigger
language plpgsql
set search_path = public
as $$
declare v_next integer;
begin
  if tg_op = 'INSERT' and new.employee_number is null then
    perform pg_advisory_xact_lock(hashtext('employee:' || new.company_id::text));
    select coalesce(max(substring(employee_number from 5)::integer), 0) + 1 into v_next
      from public.employees where company_id = new.company_id;
    new.employee_number := 'EMP-' || lpad(v_next::text, 4, '0');
  end if;
  if tg_op = 'UPDATE' and new.employee_number is distinct from old.employee_number then
    raise exception 'the employee number cannot change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_employees_number on public.employees;
create trigger trg_employees_number before insert or update on public.employees for each row execute function public.kd_employee_number();

-- Related rows belong to the same company: grade, structure, component, rule.
create or replace function public.kd_payroll_ref_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_table_name = 'employees' then
    if new.grade_id is not null then
      select company_id into v_company from public.salary_grades where id = new.grade_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the grade was not found' using errcode = 'P0002'; end if;
    end if;
    if new.structure_id is not null then
      select company_id into v_company from public.salary_structures where id = new.structure_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the salary structure was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'salary_structures' then
    if new.grade_id is not null then
      select company_id into v_company from public.salary_grades where id = new.grade_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the grade was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'salary_structure_items' then
    select company_id into v_company from public.salary_structures where id = new.structure_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the salary structure was not found' using errcode = 'P0002'; end if;
    select company_id into v_company from public.salary_components where id = new.component_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the component was not found' using errcode = 'P0002'; end if;
  elsif tg_table_name = 'payroll_tax_brackets' then
    select company_id into v_company from public.payroll_tax_rules where id = new.rule_id and deleted_at is null and method = 'bracket';
    if v_company is null or v_company <> new.company_id then raise exception 'the bracket rule was not found' using errcode = 'P0002'; end if;
  elsif tg_table_name = 'employee_documents' then
    select company_id into v_company from public.employees where id = new.employee_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the employee was not found' using errcode = 'P0002'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_employees_ref on public.employees;
create trigger trg_employees_ref before insert or update on public.employees for each row execute function public.kd_payroll_ref_guard();
drop trigger if exists trg_salary_structures_ref on public.salary_structures;
create trigger trg_salary_structures_ref before insert or update on public.salary_structures for each row execute function public.kd_payroll_ref_guard();
drop trigger if exists trg_salary_structure_items_ref on public.salary_structure_items;
create trigger trg_salary_structure_items_ref before insert or update on public.salary_structure_items for each row execute function public.kd_payroll_ref_guard();
drop trigger if exists trg_payroll_tax_brackets_ref on public.payroll_tax_brackets;
create trigger trg_payroll_tax_brackets_ref before insert or update on public.payroll_tax_brackets for each row execute function public.kd_payroll_ref_guard();
drop trigger if exists trg_employee_documents_ref on public.employee_documents;
create trigger trg_employee_documents_ref before insert or update on public.employee_documents for each row execute function public.kd_payroll_ref_guard();

revoke all on public.payroll_settings, public.salary_grades, public.salary_components, public.salary_structures, public.salary_structure_items, public.employees, public.employee_documents, public.payroll_tax_rules, public.payroll_tax_brackets from authenticated;
grant all on public.payroll_settings, public.salary_grades, public.salary_components, public.salary_structures, public.salary_structure_items, public.employees, public.employee_documents, public.payroll_tax_rules, public.payroll_tax_brackets to service_role;
