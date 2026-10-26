-- path: migrations/S16_034_tenant_limit_overrides.sql
-- STEP 16 Custom limits per company: the platform team lays a value over one entitlement of the company's plan (a bigger
-- quota for a deal, a feature switched on for a pilot). The plan itself is not changed. Only the service role reads or writes.

create table if not exists public.tenant_limit_overrides (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entitlement_key text not null check (entitlement_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null check (jsonb_typeof(value) in ('boolean', 'number', 'null')),
  reason text not null check (char_length(reason) between 10 and 500),
  set_by uuid not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (jsonb_typeof(value) <> 'number' or (value::text)::numeric >= 0)
);
create unique index if not exists uq_tenant_limit_override on public.tenant_limit_overrides (company_id, entitlement_key) where deleted_at is null;
create index if not exists ix_tenant_limit_override_company on public.tenant_limit_overrides (company_id) where deleted_at is null;

select public.apply_standard_triggers('public.tenant_limit_overrides');
select public.rls_enable_default_deny('public.tenant_limit_overrides');
select public.audit_enable_for('public.tenant_limit_overrides');
revoke all on public.tenant_limit_overrides from authenticated;
grant all on public.tenant_limit_overrides to service_role;
