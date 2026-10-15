-- path: migrations/S02_002_tenancy.sql
-- STEP 02.2 Tenancy: companies, profiles, memberships, roles, role_permissions, feature_flags and the JWT claim helpers.

-- JWT claim helpers. The tenant and role come from app_metadata, which only the server (service role) can write.
create or replace function public.app_claim(name text) returns text
language sql stable security definer
set search_path = public, auth
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> name, '')
$$;

create or replace function public.app_company_id() returns uuid
language sql stable security definer
set search_path = public, auth
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid
$$;

create or replace function public.app_role() returns text
language sql stable security definer
set search_path = public, auth
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.app_is_platform() returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select coalesce(public.app_role() in ('super_admin', 'ceo', 'admin_staff'), false)
$$;

create or replace function public.app_is_super_admin() returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select coalesce(public.app_role() = 'super_admin', false)
$$;

grant execute on function public.app_claim(text), public.app_company_id(), public.app_role(),
  public.app_is_platform(), public.app_is_super_admin() to anon, authenticated, service_role;

-- Tenant root. company_id equals id (set by trigger) so the generic tenant policy shape also fits this table.
create table if not exists public.companies (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid,
  name text not null check (char_length(name) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  plan_key text not null default 'free' check (public.is_snake_token(plan_key)),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  data_region text not null default 'global' check (public.is_snake_token(data_region)),
  country_code char(2),
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'google_drive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create or replace function public.companies_set_tenant() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.company_id := new.id;
  return new;
end
$$;

drop trigger if exists trg_companies_tenant on public.companies;
create trigger trg_companies_tenant before insert on public.companies
  for each row execute function public.companies_set_tenant();

-- Platform staff and tenant users both have a profile. Platform users carry company_id null.
create table if not exists public.profiles (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  email text not null check (char_length(email) between 3 and 320),
  full_name text not null default '' check (char_length(full_name) <= 200),
  platform_role text check (platform_role in ('super_admin', 'ceo', 'admin_staff')),
  admin_sub_role text check (admin_sub_role in ('kyc_reviewer', 'payment_processor', 'support_agent', 'content_manager', 'compliance_officer', 'fraud_analyst', 'finance_analyst')),
  locale text not null default 'en' check (locale = 'en'),
  timezone text not null default 'UTC',
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (admin_sub_role is null or platform_role = 'admin_staff'),
  check (platform_role is null or company_id is null)
);

-- Membership of a user in a tenant company. Staff permissions are granted by the owner.
create table if not exists public.memberships (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  role text not null check (role in ('owner', 'staff')),
  granted_permissions text[] not null default '{}',
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  invited_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

-- Shared reference table: the five roles. company_id is null (platform-level).
create table if not exists public.roles (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  key text not null check (key in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff')),
  label text not null,
  scope text not null check (scope in ('platform', 'tenant')),
  rank integer not null check (rank between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

-- Role to permission grants. company_id null = platform default, set = tenant override.
create table if not exists public.role_permissions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  role_key text not null check (role_key in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff')),
  permission text not null check (permission ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

-- Feature flags. company_id null = global flag, set = tenant override.
create table if not exists public.feature_flags (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_.]*$'),
  enabled boolean not null default false,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

do $$
declare t text;
begin
  foreach t in array array['companies', 'profiles', 'memberships', 'roles', 'role_permissions', 'feature_flags']
  loop
    perform public.apply_standard_triggers(('public.' || t)::regclass);
  end loop;
end
$$;

select public.rls_enable_default_deny('public.companies');
select public.rls_enable_default_deny('public.profiles');
select public.rls_enable_default_deny('public.memberships');
select public.rls_enable_default_deny('public.roles');
select public.rls_enable_default_deny('public.role_permissions');
select public.rls_enable_default_deny('public.feature_flags');

create unique index if not exists uq_companies_slug_live on public.companies (slug) where deleted_at is null;
create unique index if not exists uq_profiles_user_live on public.profiles (user_id) where deleted_at is null;
create index if not exists ix_profiles_company on public.profiles (company_id) where deleted_at is null;
create unique index if not exists uq_memberships_company_user_live on public.memberships (company_id, user_id) where deleted_at is null;
create index if not exists ix_memberships_user on public.memberships (user_id) where deleted_at is null;
create unique index if not exists uq_roles_key_live on public.roles (key) where deleted_at is null;
create unique index if not exists uq_role_permissions_live on public.role_permissions (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role_key, permission) where deleted_at is null;
create unique index if not exists uq_feature_flags_live on public.feature_flags (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key) where deleted_at is null;

-- Grants: table privileges are minimal; row access is decided by the policies below.
revoke all on public.companies, public.profiles, public.memberships, public.roles, public.role_permissions, public.feature_flags from authenticated;
grant select on public.companies, public.profiles, public.memberships, public.roles, public.role_permissions, public.feature_flags to authenticated;
grant update (name, country_code) on public.companies to authenticated;
grant update (full_name, timezone) on public.profiles to authenticated;
grant insert, update on public.memberships to authenticated;
grant insert, update on public.role_permissions, public.feature_flags to authenticated;
grant all on public.companies, public.profiles, public.memberships, public.roles, public.role_permissions, public.feature_flags to service_role;

-- Policies. A policy never reads client-supplied tenant ids: only the signed JWT claims.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (deleted_at is null and (id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (deleted_at is null and ((id = (select public.app_company_id()) and (select public.app_role()) = 'owner') or (select public.app_role()) in ('super_admin', 'ceo')))
  with check (id = (select public.app_company_id()) or (select public.app_role()) in ('super_admin', 'ceo'));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (deleted_at is null and (user_id = (select auth.uid()) or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (deleted_at is null and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (deleted_at is null and (user_id = (select auth.uid()) or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner' and role = 'staff');
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (deleted_at is null and company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner' and role = 'staff')
  with check (company_id = (select public.app_company_id()) and role = 'staff');

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (deleted_at is null);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (deleted_at is null and (company_id is null or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check ((select public.app_is_super_admin()));
drop policy if exists role_permissions_update on public.role_permissions;
create policy role_permissions_update on public.role_permissions for update to authenticated
  using ((select public.app_is_super_admin())) with check ((select public.app_is_super_admin()));

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select to authenticated
  using (deleted_at is null and (company_id is null or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists feature_flags_insert on public.feature_flags;
create policy feature_flags_insert on public.feature_flags for insert to authenticated
  with check ((select public.app_is_super_admin()));
drop policy if exists feature_flags_update on public.feature_flags;
create policy feature_flags_update on public.feature_flags for update to authenticated
  using ((select public.app_is_super_admin())) with check ((select public.app_is_super_admin()));

-- Seed the five roles (idempotent).
insert into public.roles (key, label, scope, rank)
select v.key, v.label, v.scope, v.rank
from (values
  ('super_admin', 'Super Admin', 'platform', 1),
  ('ceo', 'CEO', 'platform', 2),
  ('admin_staff', 'Admin Staff', 'platform', 3),
  ('owner', 'Owner', 'tenant', 4),
  ('staff', 'Staff', 'tenant', 5)
) as v(key, label, scope, rank)
where not exists (select 1 from public.roles r where r.key = v.key and r.deleted_at is null);
