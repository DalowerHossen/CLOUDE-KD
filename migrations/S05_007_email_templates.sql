-- path: migrations/S05_007_email_templates.sql
-- STEP 05.8 Template overrides with versions. No active override means the built-in design is used.

create table if not exists public.email_template_overrides (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  template_id text not null check (template_id ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  revision integer not null check (revision >= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  subject text not null check (char_length(subject) between 1 and 300),
  body_html text not null check (char_length(body_html) between 1 and 100000),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.email_template_overrides');
select public.rls_enable_default_deny('public.email_template_overrides');
select public.audit_enable_for('public.email_template_overrides');

create unique index if not exists uq_template_revision on public.email_template_overrides (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), template_id, revision);
create unique index if not exists uq_template_active on public.email_template_overrides (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), template_id) where status = 'active' and deleted_at is null;

revoke all on public.email_template_overrides from authenticated;
grant all on public.email_template_overrides to service_role;

-- Saves a new revision and makes it the active one; the earlier active revision is archived. Returns the revision.
create or replace function public.kd_template_save(p_company uuid, p_template text, p_subject text, p_body text, p_note text, p_user uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  next_rev integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_company::text, 'platform') || ':' || p_template, 0));
  select coalesce(max(revision), 0) + 1 into next_rev from public.email_template_overrides
    where company_id is not distinct from p_company and template_id = p_template;
  update public.email_template_overrides set status = 'archived'
    where company_id is not distinct from p_company and template_id = p_template and status = 'active' and deleted_at is null;
  insert into public.email_template_overrides (company_id, template_id, revision, status, subject, body_html, note, created_by)
  values (p_company, p_template, next_rev, 'active', p_subject, p_body, p_note, p_user);
  return next_rev;
end
$$;

-- Back to the built-in design: the active revision is archived and kept in the history.
create or replace function public.kd_template_reset(p_company uuid, p_template text) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.email_template_overrides set status = 'archived'
    where company_id is not distinct from p_company and template_id = p_template and status = 'active' and deleted_at is null;
  return found;
end
$$;

-- Makes an earlier revision active again by saving a copy of it as a new revision.
create or replace function public.kd_template_restore(p_company uuid, p_template text, p_revision integer, p_user uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  src public.email_template_overrides%rowtype;
begin
  select * into src from public.email_template_overrides
    where company_id is not distinct from p_company and template_id = p_template and revision = p_revision and deleted_at is null;
  if not found then raise exception 'revision not found' using errcode = 'P0002'; end if;
  return public.kd_template_save(p_company, p_template, src.subject, src.body_html, 'Restored from revision ' || p_revision, p_user);
end
$$;

revoke all on function public.kd_template_save(uuid, text, text, text, text, uuid), public.kd_template_reset(uuid, text),
  public.kd_template_restore(uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.kd_template_save(uuid, text, text, text, text, uuid), public.kd_template_reset(uuid, text),
  public.kd_template_restore(uuid, text, integer, uuid) to service_role;
