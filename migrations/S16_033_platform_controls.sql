-- path: migrations/S16_033_platform_controls.sql
-- STEP 16 Operations controls of the platform team: the maintenance switch, kill switches for feature flags and
-- per-company request caps. Only the service role reads or writes them.

create table if not exists public.platform_controls (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  key text not null check (key in ('maintenance')),
  value jsonb not null check (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 4096),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_platform_controls_key on public.platform_controls (key) where deleted_at is null;

create table if not exists public.kill_switches (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  flag_key text not null check (flag_key ~ '^[a-z][a-z0-9_.]{1,79}$'),
  reason text not null check (char_length(reason) between 10 and 500),
  engaged_by uuid not null,
  released_at timestamptz,
  released_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((released_at is null) = (released_by is null))
);
-- One engaged switch per flag; a released one stays as history.
create unique index if not exists uq_kill_switch_engaged on public.kill_switches (flag_key) where released_at is null and deleted_at is null;

create table if not exists public.tenant_rate_limits (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  limit_per_minute integer not null check (limit_per_minute between 1 and 100000),
  reason text not null check (char_length(reason) between 10 and 500),
  set_by uuid not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_tenant_rate_limit on public.tenant_rate_limits (company_id) where deleted_at is null;

select public.apply_standard_triggers('public.platform_controls');
select public.apply_standard_triggers('public.kill_switches');
select public.apply_standard_triggers('public.tenant_rate_limits');
select public.rls_enable_default_deny('public.platform_controls');
select public.rls_enable_default_deny('public.kill_switches');
select public.rls_enable_default_deny('public.tenant_rate_limits');
select public.audit_enable_for('public.platform_controls');
select public.audit_enable_for('public.kill_switches');
select public.audit_enable_for('public.tenant_rate_limits');
revoke all on public.platform_controls, public.kill_switches, public.tenant_rate_limits from authenticated;
grant all on public.platform_controls, public.kill_switches, public.tenant_rate_limits to service_role;
