-- path: migrations/S07_001_company_settings.sql
-- STEP 07.1 Tenant settings (one row per company and section) and onboarding milestones.

create table if not exists public.company_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  section text not null check (section ~ '^[a-z][a-z_]{1,30}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.company_milestones (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  milestone text not null check (milestone ~ '^[a-z][a-z_]{1,40}$'),
  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.company_settings');
select public.apply_standard_triggers('public.company_milestones');
select public.rls_enable_default_deny('public.company_settings');
select public.rls_enable_default_deny('public.company_milestones');
select public.audit_enable_for('public.company_settings');
select public.audit_enable_for('public.company_milestones');

create unique index if not exists uq_company_settings on public.company_settings (company_id, section) where deleted_at is null;
create unique index if not exists uq_company_milestones on public.company_milestones (company_id, milestone) where deleted_at is null;

-- A company reads and writes its own rows only through the server (service role); the browser has no direct access.
revoke all on public.company_settings, public.company_milestones from authenticated;
grant all on public.company_settings, public.company_milestones to service_role;

-- Saves one section. p_expected = 0 means "create"; any other number must equal the stored version.
-- A mismatch (or a second create) raises 40001, which the service maps to a conflict. Answers the new version.
create or replace function public.kd_company_setting_save(p_company uuid, p_section text, p_value jsonb, p_expected integer, p_user uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v integer;
begin
  if p_expected = 0 then
    begin
      insert into public.company_settings (company_id, section, value, updated_by) values (p_company, p_section, p_value, p_user) returning version into v;
    exception when unique_violation then
      raise exception 'settings section already exists' using errcode = '40001';
    end;
    return v;
  end if;
  update public.company_settings set value = p_value, updated_by = p_user
    where company_id = p_company and section = p_section and version = p_expected and deleted_at is null
    returning version into v;
  if v is null then
    raise exception 'settings version conflict' using errcode = '40001';
  end if;
  return v;
end
$$;

-- Records a milestone once. Answers true when it is new.
create or replace function public.kd_milestone_record(p_company uuid, p_milestone text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.company_milestones (company_id, milestone) values (p_company, p_milestone) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

revoke all on function public.kd_company_setting_save(uuid, text, jsonb, integer, uuid), public.kd_milestone_record(uuid, text) from public, anon, authenticated;
grant execute on function public.kd_company_setting_save(uuid, text, jsonb, integer, uuid), public.kd_milestone_record(uuid, text) to service_role;
