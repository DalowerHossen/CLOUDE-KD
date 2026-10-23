-- path: migrations/S09_012_projects.sql
-- STEP 09.12 Projects, team, milestones and time tracking.
-- A time entry is draft -> submitted -> approved -> invoiced (or rejected, then back to draft). From "submitted" on, the
-- hours, date, rate and text are fixed by a trigger; so are entries on or before the company's lock date. One running
-- timer per person.

create table if not exists public.time_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  require_approval boolean not null default true,
  round_minutes smallint not null default 0 check (round_minutes in (0, 5, 6, 10, 15, 30, 60)),
  lock_through date,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.projects (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 150),
  code text not null default '' check (char_length(code) <= 20),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'active' check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  billing_type text not null default 'hourly' check (billing_type in ('hourly', 'fixed', 'retainer', 'non_billable')),
  default_rate numeric(18,4) check (default_rate is null or default_rate >= 0),
  fixed_fee numeric(18,4) check (fixed_fee is null or fixed_fee >= 0),
  retainer_hours numeric(10,2) check (retainer_hours is null or retainer_hours > 0),
  budget_hours numeric(10,2) check (budget_hours is null or budget_hours > 0),
  budget_amount numeric(18,4) check (budget_amount is null or budget_amount > 0),
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.project_members (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  user_id uuid not null,
  role text not null default 'member' check (role in ('manager', 'member')),
  rate numeric(18,4) check (rate is null or rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.project_milestones (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 150),
  due_date date,
  amount numeric(18,4) check (amount is null or amount >= 0),
  status text not null default 'open' check (status in ('open', 'done', 'billed')),
  invoice_id uuid references public.invoices (id) on delete restrict,
  position integer not null default 1 check (position >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.time_entries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  user_id uuid not null,
  work_date date not null,
  hours numeric(6,2) not null default 0 check (hours >= 0 and hours <= 24),
  description text not null default '' check (char_length(description) <= 1000),
  billable boolean not null default true,
  rate numeric(18,4) not null default 0 check (rate >= 0),
  milestone_id uuid references public.project_milestones (id) on delete restrict,
  timer_started_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'invoiced')),
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text not null default '' check (char_length(rejected_reason) <= 300),
  invoice_id uuid references public.invoices (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (timer_started_at is not null or hours > 0)
);

select public.apply_standard_triggers('public.time_settings');
select public.apply_standard_triggers('public.projects');
select public.apply_standard_triggers('public.project_members');
select public.apply_standard_triggers('public.project_milestones');
select public.apply_standard_triggers('public.time_entries');
select public.rls_enable_default_deny('public.time_settings');
select public.rls_enable_default_deny('public.projects');
select public.rls_enable_default_deny('public.project_members');
select public.rls_enable_default_deny('public.project_milestones');
select public.rls_enable_default_deny('public.time_entries');
select public.audit_enable_for('public.time_settings');
select public.audit_enable_for('public.projects');
select public.audit_enable_for('public.project_members');
select public.audit_enable_for('public.project_milestones');
select public.audit_enable_for('public.time_entries');
revoke all on public.time_settings, public.projects, public.project_members, public.project_milestones, public.time_entries from authenticated;
grant all on public.time_settings, public.projects, public.project_members, public.project_milestones, public.time_entries to service_role;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_invoices_project') then
    alter table public.invoices add constraint fk_invoices_project foreign key (project_id) references public.projects (id) on delete restrict not valid;
  end if;
end
$$;

create unique index if not exists uq_time_settings_company on public.time_settings (company_id) where deleted_at is null;
create unique index if not exists uq_project_code on public.projects (company_id, lower(code)) where code <> '' and deleted_at is null;
create index if not exists ix_projects_company on public.projects (company_id, status, created_at desc) where deleted_at is null;
create index if not exists ix_projects_client on public.projects (client_id) where client_id is not null and deleted_at is null;
create unique index if not exists uq_project_member on public.project_members (project_id, user_id) where deleted_at is null;
create index if not exists ix_project_members_user on public.project_members (company_id, user_id) where deleted_at is null;
create index if not exists ix_milestones_project on public.project_milestones (project_id, position) where deleted_at is null;
create index if not exists ix_time_project on public.time_entries (project_id, work_date) where deleted_at is null;
create index if not exists ix_time_user on public.time_entries (company_id, user_id, work_date) where deleted_at is null;
create index if not exists ix_time_status on public.time_entries (company_id, status) where deleted_at is null;
create unique index if not exists uq_time_one_timer on public.time_entries (company_id, user_id) where timer_started_at is not null and deleted_at is null;

-- Time entries: fixed once submitted, and never inside a locked period.
create or replace function public.kd_time_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'submitted_at', 'approved_by', 'approved_at', 'rejected_reason', 'invoice_id'];
  locked date;
begin
  select s.lock_through into locked from public.time_settings s where s.company_id = new.company_id and s.deleted_at is null;
  if tg_op = 'INSERT' then
    if locked is not null and new.work_date <= locked then
      raise exception 'this period is locked' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status in ('draft', 'rejected') then
    if (to_jsonb(new) - free - array['deleted_at']) is distinct from (to_jsonb(old) - free - array['deleted_at']) and locked is not null and (old.work_date <= locked or new.work_date <= locked) then
      raise exception 'this period is locked' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null and locked is not null and old.work_date <= locked then
      raise exception 'this period is locked' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'a submitted time entry cannot be changed' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_time_entries_guard on public.time_entries;
create trigger trg_time_entries_guard before insert or update on public.time_entries for each row execute function public.kd_time_guard();
