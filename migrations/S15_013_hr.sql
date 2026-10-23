-- path: migrations/S15_013_hr.sql
-- STEP 15.10 HR (light).
--   departments, positions          the organisation: departments nest (six levels at most) and can have a head; positions belong to one.
--   employees (changed)             department_id, position_id and manager_id (the reporting line; no loops, same company).
--   checklist_templates/_items      reusable onboarding and offboarding task lists.
--   checklists, checklist_items     a list made for one employee from a template (or empty) with tasks that are ticked off.
--   leave_types, leave_balances     kinds of leave with their yearly days, and the days each employee has per year (used is kept by the database).
--   leave_requests                  a request for leave; approval takes the days from the balance once, and a request cannot ask for more than is left.
--   performance_notes               manager notes and reviews with a rating of 1 to 5 for a period.

create table if not exists public.departments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  parent_id uuid references public.departments (id) on delete restrict,
  head_employee_id uuid references public.employees (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.positions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 80),
  department_id uuid references public.departments (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

alter table public.employees add column if not exists department_id uuid references public.departments (id) on delete restrict;
alter table public.employees add column if not exists position_id uuid references public.positions (id) on delete restrict;
alter table public.employees add column if not exists manager_id uuid references public.employees (id) on delete restrict;
alter table public.employees drop constraint if exists employees_manager_not_self;
alter table public.employees add constraint employees_manager_not_self check (manager_id is null or manager_id <> id);

create table if not exists public.checklist_templates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.checklist_template_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  template_id uuid not null references public.checklist_templates (id) on delete restrict,
  position integer not null check (position between 1 and 100),
  title text not null check (char_length(title) between 1 and 200),
  days_after integer not null default 0 check (days_after between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.checklists (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'done') = (completed_at is not null))
);

create table if not exists public.checklist_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  checklist_id uuid not null references public.checklists (id) on delete restrict,
  position integer not null check (position between 1 and 100),
  title text not null check (char_length(title) between 1 and 200),
  due_on date,
  done_at timestamptz,
  done_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.leave_types (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  annual_days numeric(6,2) not null default 0 check (annual_days between 0 and 366),
  paid boolean not null default true,
  carry_over_days numeric(6,2) not null default 0 check (carry_over_days between 0 and 366),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.leave_balances (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  year integer not null check (year between 2000 and 2200),
  entitled numeric(6,2) not null default 0 check (entitled >= 0),
  used numeric(6,2) not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (used <= entitled)
);

create table if not exists public.leave_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  days numeric(6,2) not null check (days > 0 and days <= 366),
  reason text not null default '' check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 300),
  token_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date)),
  check (days <= (end_date - start_date) + 1),
  check (status not in ('approved', 'rejected') or decided_at is not null),
  check (status <> 'pending' or decided_at is null)
);

create table if not exists public.performance_notes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  kind text not null default 'note' check (kind in ('note', 'review')),
  period text not null default '' check (char_length(period) <= 20),
  rating smallint check (rating is null or rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 2000),
  raise_suggested boolean not null default false,
  author_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kind = 'review' or rating is null),
  check (kind <> 'review' or (rating is not null and period <> ''))
);

select public.apply_standard_triggers('public.departments');
select public.apply_standard_triggers('public.positions');
select public.apply_standard_triggers('public.checklist_templates');
select public.apply_standard_triggers('public.checklist_template_items');
select public.apply_standard_triggers('public.checklists');
select public.apply_standard_triggers('public.checklist_items');
select public.apply_standard_triggers('public.leave_types');
select public.apply_standard_triggers('public.leave_balances');
select public.apply_standard_triggers('public.leave_requests');
select public.apply_standard_triggers('public.performance_notes');
select public.rls_enable_default_deny('public.departments');
select public.rls_enable_default_deny('public.positions');
select public.rls_enable_default_deny('public.checklist_templates');
select public.rls_enable_default_deny('public.checklist_template_items');
select public.rls_enable_default_deny('public.checklists');
select public.rls_enable_default_deny('public.checklist_items');
select public.rls_enable_default_deny('public.leave_types');
select public.rls_enable_default_deny('public.leave_balances');
select public.rls_enable_default_deny('public.leave_requests');
select public.rls_enable_default_deny('public.performance_notes');
select public.audit_enable_for('public.departments');
select public.audit_enable_for('public.positions');
select public.audit_enable_for('public.checklist_templates');
select public.audit_enable_for('public.checklist_template_items');
select public.audit_enable_for('public.checklists');
select public.audit_enable_for('public.checklist_items');
select public.audit_enable_for('public.leave_types');
select public.audit_enable_for('public.leave_balances');
select public.audit_enable_for('public.leave_requests');
select public.audit_enable_for('public.performance_notes');

create unique index if not exists uq_departments_name on public.departments (company_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where deleted_at is null;
create unique index if not exists uq_positions_title on public.positions (company_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(title)) where deleted_at is null;
create index if not exists ix_employees_manager on public.employees (manager_id) where deleted_at is null and manager_id is not null;
create index if not exists ix_employees_department on public.employees (department_id) where deleted_at is null and department_id is not null;
create unique index if not exists uq_checklist_templates_name on public.checklist_templates (company_id, kind, lower(name)) where deleted_at is null;
create unique index if not exists uq_checklist_template_items on public.checklist_template_items (template_id, position) where deleted_at is null;
create index if not exists ix_checklists_employee on public.checklists (employee_id, created_at desc) where deleted_at is null;
create unique index if not exists uq_checklist_items on public.checklist_items (checklist_id, position) where deleted_at is null;
create unique index if not exists uq_leave_types_name on public.leave_types (company_id, lower(name)) where deleted_at is null;
create unique index if not exists uq_leave_balances on public.leave_balances (employee_id, leave_type_id, year) where deleted_at is null;
create index if not exists ix_leave_requests_employee on public.leave_requests (employee_id, start_date desc) where deleted_at is null;
create index if not exists ix_leave_requests_company on public.leave_requests (company_id, status, start_date) where deleted_at is null;
create index if not exists ix_performance_notes_employee on public.performance_notes (employee_id, created_at desc) where deleted_at is null;

-- Everything that points to another row points to one of the same company; departments and reporting lines have no loops.
create or replace function public.kd_hr_ref_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_cur uuid; v_depth integer := 0;
begin
  if tg_table_name = 'departments' then
    if new.parent_id is not null then
      select company_id into v_company from public.departments where id = new.parent_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the parent department was not found' using errcode = 'P0002'; end if;
      v_cur := new.parent_id;
      while v_cur is not null and v_depth < 8 loop
        if v_cur = new.id then raise exception 'a department cannot be inside itself' using errcode = '22023'; end if;
        select parent_id into v_cur from public.departments where id = v_cur;
        v_depth := v_depth + 1;
      end loop;
      if v_depth >= 6 then raise exception 'departments nest six levels at most' using errcode = '22023'; end if;
    end if;
    if new.head_employee_id is not null then
      select company_id into v_company from public.employees where id = new.head_employee_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the head was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'positions' then
    if new.department_id is not null then
      select company_id into v_company from public.departments where id = new.department_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the department was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'employees' then
    if new.department_id is not null then
      select company_id into v_company from public.departments where id = new.department_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the department was not found' using errcode = 'P0002'; end if;
    end if;
    if new.position_id is not null then
      select company_id into v_company from public.positions where id = new.position_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the position was not found' using errcode = 'P0002'; end if;
    end if;
    if new.manager_id is not null then
      select company_id into v_company from public.employees where id = new.manager_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the manager was not found' using errcode = 'P0002'; end if;
      v_cur := new.manager_id;
      while v_cur is not null and v_depth < 50 loop
        if v_cur = new.id then raise exception 'the reporting line would be a loop' using errcode = '22023'; end if;
        select manager_id into v_cur from public.employees where id = v_cur;
        v_depth := v_depth + 1;
      end loop;
    end if;
  elsif tg_table_name in ('checklists', 'leave_balances', 'leave_requests', 'performance_notes') then
    select company_id into v_company from public.employees where id = new.employee_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the employee was not found' using errcode = 'P0002'; end if;
    if tg_table_name in ('leave_balances', 'leave_requests') then
      select company_id into v_company from public.leave_types where id = new.leave_type_id and deleted_at is null;
      if v_company is null or v_company <> new.company_id then raise exception 'the leave type was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'checklist_template_items' then
    select company_id into v_company from public.checklist_templates where id = new.template_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the template was not found' using errcode = 'P0002'; end if;
  elsif tg_table_name = 'checklist_items' then
    select company_id into v_company from public.checklists where id = new.checklist_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the checklist was not found' using errcode = 'P0002'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_departments_ref on public.departments;
create trigger trg_departments_ref before insert or update on public.departments for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_positions_ref on public.positions;
create trigger trg_positions_ref before insert or update on public.positions for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_employees_hr_ref on public.employees;
create trigger trg_employees_hr_ref before insert or update on public.employees for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_checklists_ref on public.checklists;
create trigger trg_checklists_ref before insert or update on public.checklists for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_leave_balances_ref on public.leave_balances;
create trigger trg_leave_balances_ref before insert or update on public.leave_balances for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_leave_requests_ref on public.leave_requests;
create trigger trg_leave_requests_ref before insert or update on public.leave_requests for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_performance_notes_ref on public.performance_notes;
create trigger trg_performance_notes_ref before insert or update on public.performance_notes for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_checklist_template_items_ref on public.checklist_template_items;
create trigger trg_checklist_template_items_ref before insert or update on public.checklist_template_items for each row execute function public.kd_hr_ref_guard();
drop trigger if exists trg_checklist_items_ref on public.checklist_items;
create trigger trg_checklist_items_ref before insert or update on public.checklist_items for each row execute function public.kd_hr_ref_guard();

-- A checklist is done when every item is ticked: the status follows the items.
create or replace function public.kd_checklist_done() returns trigger
language plpgsql
set search_path = public
as $$
declare v_open integer; v_list uuid;
begin
  v_list := coalesce(new.checklist_id, old.checklist_id);
  select count(*) into v_open from public.checklist_items where checklist_id = v_list and deleted_at is null and done_at is null;
  update public.checklists set status = case when v_open = 0 and exists (select 1 from public.checklist_items where checklist_id = v_list and deleted_at is null) then 'done' else 'open' end,
    completed_at = case when v_open = 0 and exists (select 1 from public.checklist_items where checklist_id = v_list and deleted_at is null) then coalesce(completed_at, now()) else null end
    where id = v_list;
  return null;
end
$$;
drop trigger if exists trg_checklist_items_done on public.checklist_items;
create trigger trg_checklist_items_done after insert or update on public.checklist_items for each row execute function public.kd_checklist_done();

-- Leave. A request cannot ask for more days than are left (entitled less used less the days of requests still waiting). Approval
-- takes the days from the balance once; cancelling an approved request gives them back; a decided request does not change days.
create or replace function public.kd_leave_request_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_year integer; v_bal public.leave_balances; v_waiting numeric;
begin
  v_year := extract(year from new.start_date)::integer;
  select * into v_bal from public.leave_balances
    where employee_id = new.employee_id and leave_type_id = new.leave_type_id and year = v_year and deleted_at is null for update;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'a new request is pending' using errcode = '22023'; end if;
    if not found then raise exception 'there is no leave balance for this year' using errcode = '23514'; end if;
    select coalesce(sum(days), 0) into v_waiting from public.leave_requests
      where employee_id = new.employee_id and leave_type_id = new.leave_type_id and status = 'pending' and extract(year from start_date) = v_year and deleted_at is null;
    if new.days > v_bal.entitled - v_bal.used - v_waiting then raise exception 'the request is more than the leave left' using errcode = '23514'; end if;
    if exists (select 1 from public.leave_requests o where o.employee_id = new.employee_id and o.status in ('pending', 'approved') and o.deleted_at is null
               and o.start_date <= new.end_date and o.end_date >= new.start_date) then
      raise exception 'the dates overlap another request' using errcode = '23505';
    end if;
    return new;
  end if;
  if new.days <> old.days or new.start_date <> old.start_date or new.end_date <> old.end_date or new.leave_type_id <> old.leave_type_id or new.employee_id <> old.employee_id then
    raise exception 'a request cannot change; cancel it and make a new one' using errcode = '55000';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'rejected', 'cancelled')) or (old.status = 'approved' and new.status = 'cancelled')) then
      raise exception 'the request cannot move from % to %', old.status, new.status using errcode = '55000';
    end if;
    if new.status = 'approved' then
      if not found then raise exception 'there is no leave balance for this year' using errcode = '23514'; end if;
      if new.days > v_bal.entitled - v_bal.used then raise exception 'the request is more than the leave left' using errcode = '23514'; end if;
      update public.leave_balances set used = used + new.days where id = v_bal.id;
    elsif new.status = 'cancelled' and old.status = 'approved' then
      update public.leave_balances set used = greatest(used - old.days, 0) where id = v_bal.id;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_leave_requests_guard on public.leave_requests;
create trigger trg_leave_requests_guard before insert or update on public.leave_requests for each row execute function public.kd_leave_request_guard();

revoke all on public.departments, public.positions, public.checklist_templates, public.checklist_template_items, public.checklists, public.checklist_items, public.leave_types, public.leave_balances, public.leave_requests, public.performance_notes from authenticated;
grant all on public.departments, public.positions, public.checklist_templates, public.checklist_template_items, public.checklists, public.checklist_items, public.leave_types, public.leave_balances, public.leave_requests, public.performance_notes to service_role;
