-- path: migrations/S06_005_seo.sql
-- STEP 06.6 Site-wide search settings: verification tags, social profiles and organization facts (one row, key "site").

create table if not exists public.seo_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.seo_settings');
select public.rls_enable_default_deny('public.seo_settings');
select public.audit_enable_for('public.seo_settings');

create unique index if not exists uq_seo_settings_key on public.seo_settings (key) where deleted_at is null;

revoke all on public.seo_settings from authenticated;
grant all on public.seo_settings to service_role;
