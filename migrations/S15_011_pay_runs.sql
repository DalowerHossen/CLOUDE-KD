-- path: migrations/S15_011_pay_runs.sql
-- STEP 15.8.b Pay runs and payslips.
--   pay_runs       one run for a pay period: draft, calculated, submitted, approved, paid. Totals are fixed once submitted.
--   pay_run_items  one row per employee in a run (the payslip data: lines, totals, the inputs used). An employee has one live
--                  item per period and periods of one employee never overlap (guard against paying twice).
-- Money is US dollars in numeric(18,4). The employee name and number are copied so a payslip never changes later.

create table if not exists public.pay_runs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  run_number text check (run_number is null or run_number ~ '^PR-\d{4}-\d{4,6}$'),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  status text not null default 'draft' check (status in ('draft', 'calculated', 'submitted', 'approved', 'paid')),
  employee_count integer not null default 0 check (employee_count >= 0),
  gross numeric(18,4) not null default 0,
  taxable numeric(18,4) not null default 0,
  employee_taxes numeric(18,4) not null default 0,
  deductions numeric(18,4) not null default 0,
  net numeric(18,4) not null default 0,
  employer_contributions numeric(18,4) not null default 0,
  employer_cost numeric(18,4) not null default 0,
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  approval_request_id uuid,
  calculated_at timestamptz,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  event_published_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  paid_on date,
  payment_method text check (payment_method is null or payment_method = 'bank_transfer'),
  payment_reference text not null default '' check (char_length(payment_reference) <= 80),
  paid_event_published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (period_end >= period_start),
  check ((status in ('approved', 'paid')) = (approved_at is not null)),
  check ((status = 'paid') = (paid_at is not null)),
  check (net >= 0)
);

create table if not exists public.pay_run_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  run_id uuid not null references public.pay_runs (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  employee_number text not null,
  employee_name text not null check (char_length(employee_name) between 1 and 200),
  period_start date not null,
  period_end date not null,
  active boolean not null default true,
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  gross numeric(18,4) not null default 0,
  taxable numeric(18,4) not null default 0,
  employee_taxes numeric(18,4) not null default 0,
  deductions numeric(18,4) not null default 0,
  net numeric(18,4) not null default 0 check (net >= 0),
  employer_contributions numeric(18,4) not null default 0,
  employer_cost numeric(18,4) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_on date,
  payslip_file_id uuid,
  payslip_sha256 text check (payslip_sha256 is null or payslip_sha256 ~ '^[0-9a-f]{64}$'),
  payslip_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (period_end >= period_start),
  check ((payment_status = 'paid') = (paid_on is not null))
);

select public.apply_standard_triggers('public.pay_runs');
select public.apply_standard_triggers('public.pay_run_items');
select public.rls_enable_default_deny('public.pay_runs');
select public.rls_enable_default_deny('public.pay_run_items');
select public.audit_enable_for('public.pay_runs');
select public.audit_enable_for('public.pay_run_items');

create unique index if not exists uq_pay_runs_number on public.pay_runs (company_id, run_number) where deleted_at is null;
create index if not exists ix_pay_runs_company on public.pay_runs (company_id, period_end desc) where deleted_at is null;
-- One live item per employee and period; the trigger below also refuses overlapping periods.
create unique index if not exists uq_pay_run_items_period on public.pay_run_items (company_id, employee_id, period_start, period_end) where active and deleted_at is null;
create unique index if not exists uq_pay_run_items_run on public.pay_run_items (run_id, employee_id) where deleted_at is null;
create index if not exists ix_pay_run_items_employee on public.pay_run_items (employee_id, period_end) where active and deleted_at is null;

-- Run number PR-2026-0001 per company and year (the year of the period end).
create or replace function public.kd_pay_run_number() returns trigger
language plpgsql
set search_path = public
as $$
declare v_next integer; v_year text;
begin
  if tg_op = 'INSERT' and new.run_number is null then
    v_year := to_char(new.period_end, 'YYYY');
    perform pg_advisory_xact_lock(hashtext('payrun:' || new.company_id::text || v_year));
    select coalesce(max(substring(run_number from 9)::integer), 0) + 1 into v_next
      from public.pay_runs where company_id = new.company_id and run_number like 'PR-' || v_year || '-%';
    new.run_number := 'PR-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  if tg_op = 'UPDATE' and new.run_number is distinct from old.run_number then
    raise exception 'the run number cannot change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_pay_runs_number on public.pay_runs;
create trigger trg_pay_runs_number before insert or update on public.pay_runs for each row execute function public.kd_pay_run_number();

-- The status moves one way. From submission on the period and the totals do not change; an approved run changes only to be paid and
-- to record its events; a paid run changes nothing but the event time.
create or replace function public.kd_pay_run_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status <> old.status and not (
         (old.status = 'draft' and new.status = 'calculated')
      or (old.status = 'calculated' and new.status in ('draft', 'submitted'))
      or (old.status = 'submitted' and new.status in ('draft', 'approved'))
      or (old.status = 'approved' and new.status = 'paid')) then
      raise exception 'the pay run cannot move from % to %', old.status, new.status using errcode = '55000';
    end if;
    if old.status in ('submitted', 'approved', 'paid') and new.status = old.status and (
         new.period_start <> old.period_start or new.period_end <> old.period_end or new.pay_date <> old.pay_date
      or new.gross <> old.gross or new.net <> old.net or new.employer_cost <> old.employer_cost or new.employee_taxes <> old.employee_taxes
      or new.deductions <> old.deductions or new.employee_count <> old.employee_count or new.inputs::text <> old.inputs::text
      or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'a submitted pay run cannot change' using errcode = '55000';
    end if;
    if old.status = 'paid' and (new.paid_on is distinct from old.paid_on or new.payment_reference <> old.payment_reference) then
      raise exception 'a paid pay run cannot change' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_pay_runs_guard on public.pay_runs;
create trigger trg_pay_runs_guard before insert or update on public.pay_runs for each row execute function public.kd_pay_run_guard();

-- An item: of a draft or calculated run (its figures), for an employee of the same company; the period is the run's; periods of one
-- employee never overlap (a person is not paid twice for the same days). After approval only payment and payslip fields change.
create or replace function public.kd_pay_run_item_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_run public.pay_runs; v_emp public.employees;
begin
  select * into v_run from public.pay_runs where id = new.run_id;
  if not found or v_run.company_id <> new.company_id then raise exception 'the pay run was not found' using errcode = 'P0002'; end if;
  if tg_op = 'INSERT' then
    select * into v_emp from public.employees where id = new.employee_id;
    if not found or v_emp.company_id <> new.company_id then raise exception 'the employee was not found' using errcode = 'P0002'; end if;
    if v_run.status not in ('draft', 'calculated') then raise exception 'only a draft pay run can take items' using errcode = '55000'; end if;
    if new.period_start <> v_run.period_start or new.period_end <> v_run.period_end then
      raise exception 'the item period must be the period of the run' using errcode = '22023';
    end if;
  else
    if v_run.status in ('submitted', 'approved', 'paid') and (
         new.gross <> old.gross or new.net <> old.net or new.employee_taxes <> old.employee_taxes or new.deductions <> old.deductions
      or new.employer_cost <> old.employer_cost or new.lines::text <> old.lines::text or new.input::text <> old.input::text
      or new.employee_id <> old.employee_id or new.active <> old.active or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'the items of a submitted pay run cannot change' using errcode = '55000';
    end if;
  end if;
  if new.active and new.deleted_at is null and (tg_op = 'INSERT' or old.active is not true or old.deleted_at is not null) then
    if exists (
      select 1 from public.pay_run_items o
      where o.employee_id = new.employee_id and o.id <> new.id and o.active and o.deleted_at is null
        and o.period_start <= new.period_end and o.period_end >= new.period_start) then
      raise exception 'this employee is already paid for part of this period' using errcode = '23505';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_pay_run_items_guard on public.pay_run_items;
create trigger trg_pay_run_items_guard before insert or update on public.pay_run_items for each row execute function public.kd_pay_run_item_guard();

revoke all on public.pay_runs, public.pay_run_items from authenticated;
grant all on public.pay_runs, public.pay_run_items to service_role;
