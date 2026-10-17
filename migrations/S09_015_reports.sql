-- path: migrations/S09_015_reports.sql
-- STEP 09.15 Reports: presets people save (a report with its filters) and schedules that e-mail a link to a report file
-- every week or month. Reports themselves are computed on request from the invoice, payment, time and estimate tables.

create table if not exists public.report_presets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  report_key text not null check (report_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  params jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.report_schedules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  report_key text not null check (report_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  params jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  format text not null check (format in ('csv', 'xlsx', 'pdf')),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  weekday smallint check (weekday is null or weekday between 1 and 7),
  month_day smallint check (month_day is null or month_day between 1 and 28),
  recipients jsonb not null check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) between 1 and 10),
  enabled boolean not null default true,
  next_run_on date not null,
  last_run_on date,
  last_error text not null default '' check (char_length(last_error) <= 300),
  failure_count integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((frequency = 'weekly' and weekday is not null) or (frequency = 'monthly' and month_day is not null))
);

select public.apply_standard_triggers('public.report_presets');
select public.apply_standard_triggers('public.report_schedules');
select public.rls_enable_default_deny('public.report_presets');
select public.rls_enable_default_deny('public.report_schedules');
select public.audit_enable_for('public.report_schedules');
revoke all on public.report_presets, public.report_schedules from authenticated;
grant all on public.report_presets, public.report_schedules to service_role;

create index if not exists ix_report_presets_user on public.report_presets (company_id, user_id, report_key) where deleted_at is null;
create index if not exists ix_report_schedules_due on public.report_schedules (next_run_on) where enabled and deleted_at is null;
create index if not exists ix_report_schedules_company on public.report_schedules (company_id) where deleted_at is null;
