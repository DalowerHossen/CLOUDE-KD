-- path: migrations/S02_007_compliance.sql
-- STEP 02.9a Compliance data layer: consent records, DSAR requests, retention policies, data classification.
-- Rows hold references and keyed hashes of subjects, never raw e-mail addresses or names.

create table if not exists public.consent_records_platform (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  subject_hash text not null check (char_length(subject_hash) = 64),
  purpose text not null check (purpose in ('analytics', 'marketing', 'whatsapp', 'email_marketing', 'cookies_functional', 'terms', 'refund_policy')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  text_hash text not null check (char_length(text_hash) = 64),
  granted boolean not null default true,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text not null default 'web' check (source in ('web', 'api', 'admin', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.dsar_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  request_type text not null check (request_type in ('export', 'erase', 'rectify', 'restrict', 'object')),
  subject_user_id uuid,
  subject_hash text not null check (char_length(subject_hash) = 64),
  jurisdiction text not null default 'global' check (char_length(jurisdiction) between 2 and 20),
  status text not null default 'received' check (status in ('received', 'verifying', 'in_progress', 'completed', 'rejected')),
  due_at timestamptz not null,
  requested_by uuid,
  handled_by uuid,
  result_ref text check (char_length(result_ref) <= 500),
  certificate_hash text check (certificate_hash is null or char_length(certificate_hash) = 64),
  rejection_reason text check (char_length(rejection_reason) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.retention_policies (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  data_type text not null check (data_type ~ '^[a-z][a-z0-9_]*$'),
  jurisdiction text not null default 'global' check (char_length(jurisdiction) between 2 and 20),
  retention_days integer not null check (retention_days between 1 and 36500),
  action text not null default 'delete' check (action in ('delete', 'anonymize', 'archive')),
  legal_basis text not null default '' check (char_length(legal_basis) <= 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.data_classifications (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]*$'),
  column_name text not null default '*' check (column_name = '*' or column_name ~ '^[a-z][a-z0-9_]*$'),
  classification text not null check (classification in ('public', 'internal', 'confidential', 'restricted')),
  contains_pii boolean not null default false,
  retention_data_type text check (retention_data_type is null or retention_data_type ~ '^[a-z][a-z0-9_]*$'),
  origin text not null default '' check (char_length(origin) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

do $$
declare t text;
begin
  foreach t in array array['consent_records_platform', 'dsar_requests', 'retention_policies', 'data_classifications']
  loop
    perform public.apply_standard_triggers(('public.' || t)::regclass);
    perform public.audit_enable_for(('public.' || t)::regclass);
  end loop;
end
$$;

select public.rls_enable_default_deny('public.consent_records_platform');
select public.rls_enable_default_deny('public.dsar_requests');
select public.rls_enable_default_deny('public.retention_policies');
select public.rls_enable_default_deny('public.data_classifications');

create index if not exists ix_consent_subject on public.consent_records_platform (subject_hash, purpose, recorded_at desc);
create index if not exists ix_consent_company on public.consent_records_platform (company_id, recorded_at desc);
create index if not exists ix_dsar_status_due on public.dsar_requests (status, due_at);
create index if not exists ix_dsar_company on public.dsar_requests (company_id, created_at desc);
create unique index if not exists uq_retention_live on public.retention_policies (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), data_type, jurisdiction) where deleted_at is null;
create unique index if not exists uq_classification_live on public.data_classifications (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), table_name, column_name) where deleted_at is null;

-- Access ---------------------------------------------------------------------------------------------------------------
revoke all on public.consent_records_platform, public.dsar_requests, public.retention_policies, public.data_classifications from authenticated;
grant select on public.consent_records_platform, public.dsar_requests, public.retention_policies, public.data_classifications to authenticated;
grant insert, update on public.dsar_requests, public.retention_policies, public.data_classifications to authenticated;
grant all on public.consent_records_platform, public.dsar_requests, public.retention_policies, public.data_classifications to service_role;

drop policy if exists consent_select on public.consent_records_platform;
create policy consent_select on public.consent_records_platform for select to authenticated
  using (deleted_at is null and ((select public.app_is_platform()) or (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner')));

drop policy if exists dsar_select on public.dsar_requests;
create policy dsar_select on public.dsar_requests for select to authenticated
  using (deleted_at is null and ((select public.app_is_platform())
    or (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner')
    or requested_by = (select auth.uid())));
drop policy if exists dsar_insert on public.dsar_requests;
create policy dsar_insert on public.dsar_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and company_id is not distinct from (select public.app_company_id()) and status = 'received');
drop policy if exists dsar_update on public.dsar_requests;
create policy dsar_update on public.dsar_requests for update to authenticated
  using ((select public.app_role()) in ('super_admin', 'ceo', 'admin_staff'))
  with check ((select public.app_role()) in ('super_admin', 'ceo', 'admin_staff'));

drop policy if exists retention_select on public.retention_policies;
create policy retention_select on public.retention_policies for select to authenticated
  using (deleted_at is null and (company_id is null or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists retention_insert on public.retention_policies;
create policy retention_insert on public.retention_policies for insert to authenticated
  with check ((select public.app_role()) in ('super_admin', 'ceo'));
drop policy if exists retention_update on public.retention_policies;
create policy retention_update on public.retention_policies for update to authenticated
  using ((select public.app_role()) in ('super_admin', 'ceo')) with check ((select public.app_role()) in ('super_admin', 'ceo'));

drop policy if exists classification_select on public.data_classifications;
create policy classification_select on public.data_classifications for select to authenticated
  using (deleted_at is null and (select public.app_is_platform()));
drop policy if exists classification_insert on public.data_classifications;
create policy classification_insert on public.data_classifications for insert to authenticated
  with check ((select public.app_role()) in ('super_admin', 'ceo'));
drop policy if exists classification_update on public.data_classifications;
create policy classification_update on public.data_classifications for update to authenticated
  using ((select public.app_role()) in ('super_admin', 'ceo')) with check ((select public.app_role()) in ('super_admin', 'ceo'));

-- Erasure: replace personal data of one profile by a tombstone. Audit rows only hold the profile id, so the hash
-- chain stays valid. Returns the SHA-256 certificate of deletion.
create or replace function public.kd_dsar_erase_profile(p_request uuid, p_handler uuid) returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  req public.dsar_requests;
  cert text;
begin
  select * into req from public.dsar_requests where id = p_request and request_type = 'erase' for update;
  if not found then
    raise exception 'erase request not found' using errcode = '02000';
  end if;
  if req.status = 'completed' then
    return req.certificate_hash;
  end if;
  if req.subject_user_id is null then
    raise exception 'erase request has no subject' using errcode = '22023';
  end if;
  update public.profiles set email = 'erased+' || id::text || '@invalid.example', full_name = '', status = 'disabled'
  where user_id = req.subject_user_id;
  update public.memberships set status = 'suspended', granted_permissions = '{}' where user_id = req.subject_user_id;
  cert := encode(extensions.digest('kd-erasure-v1|' || req.id::text || '|' || req.subject_user_id::text || '|' || now()::text, 'sha256'), 'hex');
  update public.dsar_requests set status = 'completed', handled_by = p_handler, certificate_hash = cert, completed_at = now() where id = req.id;
  return cert;
end
$$;

-- Retention for the data types owned by STEP 02. Other STEPs add their own handlers in TypeScript.
create or replace function public.kd_apply_retention_core() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p record; n integer; total jsonb := '{}'::jsonb;
begin
  perform set_config('kd.allow_hard_delete', 'on', true);
  for p in select data_type, min(retention_days) as days from public.retention_policies
    where enabled and deleted_at is null and company_id is null and data_type in ('domain_events', 'job_queue', 'dsar_requests', 'consent_withdrawn')
    group by data_type
  loop
    if p.data_type = 'domain_events' then
      delete from public.domain_events where status = 'done' and processed_at < now() - make_interval(days => p.days);
    elsif p.data_type = 'job_queue' then
      delete from public.job_queue where status in ('done', 'dead') and finished_at < now() - make_interval(days => p.days);
    elsif p.data_type = 'dsar_requests' then
      delete from public.dsar_requests where status in ('completed', 'rejected') and completed_at < now() - make_interval(days => p.days);
    else
      delete from public.consent_records_platform where withdrawn_at is not null and withdrawn_at < now() - make_interval(days => p.days);
    end if;
    get diagnostics n = row_count;
    total := total || jsonb_build_object(p.data_type, n);
  end loop;
  return total;
end
$$;

revoke execute on function public.kd_dsar_erase_profile(uuid, uuid), public.kd_apply_retention_core() from public, anon, authenticated;
grant execute on function public.kd_dsar_erase_profile(uuid, uuid), public.kd_apply_retention_core() to service_role;

-- Seeds (idempotent): platform-wide retention defaults and classification of the STEP 02 tables.
insert into public.retention_policies (data_type, jurisdiction, retention_days, action, legal_basis)
select v.data_type, 'global', v.days, v.action, v.basis
from (values
  ('domain_events', 30, 'delete', 'Operational outbox'),
  ('job_queue', 30, 'delete', 'Operational queue'),
  ('dsar_requests', 2555, 'delete', 'Regulatory evidence for privacy requests (7 years)'),
  ('consent_withdrawn', 2555, 'delete', 'Consent evidence after withdrawal (7 years)')
) as v(data_type, days, action, basis)
where not exists (select 1 from public.retention_policies r where r.company_id is null and r.data_type = v.data_type and r.jurisdiction = 'global' and r.deleted_at is null);

insert into public.data_classifications (table_name, column_name, classification, contains_pii, retention_data_type, origin)
select v.t, v.c, v.cl, v.pii, v.rt, v.o
from (values
  ('profiles', 'email', 'restricted', true, null, 'Sign-up form'),
  ('profiles', 'full_name', 'restricted', true, null, 'Sign-up form'),
  ('companies', '*', 'confidential', false, null, 'Company setup'),
  ('memberships', '*', 'confidential', false, null, 'Owner invitation'),
  ('audit_logs', '*', 'restricted', false, null, 'System event'),
  ('consent_records_platform', '*', 'restricted', false, 'consent_withdrawn', 'Consent banner and forms'),
  ('dsar_requests', '*', 'restricted', false, 'dsar_requests', 'Privacy request form'),
  ('domain_events', '*', 'internal', false, 'domain_events', 'System event'),
  ('job_queue', '*', 'internal', false, 'job_queue', 'System event')
) as v(t, c, cl, pii, rt, o)
where not exists (select 1 from public.data_classifications d where d.company_id is null and d.table_name = v.t and d.column_name = v.c and d.deleted_at is null);
