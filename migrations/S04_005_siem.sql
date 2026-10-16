-- path: migrations/S04_005_siem.sql
-- STEP 04.10 SIEM: destinations with a delivery cursor, indicators of compromise and correlation findings.

create table if not exists public.siem_destinations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('splunk_hec', 'elastic', 'datadog', 'syslog_http', 'cef_http', 'leef_http', 'cloudwatch_gateway', 'sentinel_gateway', 'chronicle_gateway')),
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 500),
  credential jsonb,
  enabled boolean not null default true,
  min_severity text not null default 'low' check (min_severity in ('info', 'low', 'medium', 'high', 'critical')),
  cursor_id uuid,
  last_success_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  failures integer not null default 0 check (failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.siem_iocs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  ioc_type text not null check (ioc_type in ('ip_hash', 'user_agent_hash', 'email_hash')),
  value text not null check (value ~ '^[0-9a-f]{64}$'),
  source text not null check (char_length(source) between 2 and 80),
  severity text not null default 'high' check (severity in ('low', 'medium', 'high', 'critical')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.siem_findings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  rule_id text not null check (rule_id ~ '^[a-z][a-z0-9_.]*$'),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  subject_ref text not null check (char_length(subject_ref) between 1 and 100),
  event_count integer not null check (event_count >= 1),
  first_event_at timestamptz not null,
  last_event_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.siem_destinations');
select public.apply_standard_triggers('public.siem_iocs');
select public.apply_standard_triggers('public.siem_findings');
select public.rls_enable_default_deny('public.siem_destinations');
select public.rls_enable_default_deny('public.siem_iocs');
select public.rls_enable_default_deny('public.siem_findings');
select public.audit_enable_for('public.siem_destinations');
select public.audit_enable_for('public.siem_iocs');

create unique index if not exists uq_siem_destination_name on public.siem_destinations (lower(name)) where deleted_at is null;
create unique index if not exists uq_siem_ioc on public.siem_iocs (ioc_type, value) where deleted_at is null;
-- One open finding per rule and subject: repeated hits update it instead of creating duplicates.
create unique index if not exists uq_siem_finding_open on public.siem_findings (rule_id, subject_ref) where deleted_at is null and status <> 'closed';
create index if not exists ix_siem_findings_time on public.siem_findings (created_at desc);

revoke all on public.siem_destinations, public.siem_iocs, public.siem_findings from authenticated;
grant all on public.siem_destinations, public.siem_iocs, public.siem_findings to service_role;

create or replace function public.kd_severity_rank(p text) returns integer
language sql immutable
as $$ select case p when 'info' then 0 when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'critical' then 4 else 0 end $$;

-- Events after the cursor (ids are time-ordered UUID v7), at or above the minimum severity.
create or replace function public.kd_siem_fetch(p_after uuid, p_min_severity text, p_limit integer) returns setof public.security_events
language sql stable security definer
set search_path = public
as $$
  select e.* from public.security_events e
  where (p_after is null or e.id > p_after)
    and public.kd_severity_rank(e.severity) >= public.kd_severity_rank(p_min_severity)
  order by e.id
  limit greatest(1, least(p_limit, 500))
$$;

create or replace function public.kd_siem_delivery_result(p_destination uuid, p_last_id uuid, p_error text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_error is null then
    update public.siem_destinations
      set cursor_id = coalesce(p_last_id, cursor_id), last_success_at = now(), last_error = null, failures = 0, updated_at = now()
      where id = p_destination and deleted_at is null;
  else
    update public.siem_destinations
      set last_error = left(p_error, 300), failures = failures + 1, updated_at = now()
      where id = p_destination and deleted_at is null;
  end if;
end
$$;

-- Groups events of the given types by address or actor inside a window. Returns subjects at or above the threshold.
create or replace function public.kd_siem_correlate(p_types text[], p_group_by text, p_window_minutes integer, p_threshold integer) returns table (subject_ref text, event_count integer, first_at timestamptz, last_at timestamptz, event_ids uuid[])
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_group_by not in ('ip_hash', 'actor_user_id') then
    raise exception 'invalid group' using errcode = '22023';
  end if;
  return query execute format(
    'select %1$I::text, count(*)::integer, min(created_at), max(created_at), (array_agg(id order by id desc))[1:20]
     from public.security_events
     where event_type = any($1) and created_at > now() - make_interval(mins => $2) and %1$I is not null
     group by %1$I having count(*) >= $3', p_group_by)
    using p_types, p_window_minutes, p_threshold;
end
$$;

-- Events whose address matches a live indicator of compromise.
create or replace function public.kd_siem_ioc_hits(p_window_minutes integer) returns table (ioc_id uuid, severity text, subject_ref text, event_count integer, first_at timestamptz, last_at timestamptz, event_ids uuid[])
language sql stable security definer
set search_path = public
as $$
  select i.id, i.severity, e.ip_hash, count(*)::integer, min(e.created_at), max(e.created_at), (array_agg(e.id order by e.id desc))[1:20]
  from public.siem_iocs i
  join public.security_events e on e.ip_hash = i.value and i.ioc_type = 'ip_hash'
  where i.deleted_at is null and (i.expires_at is null or i.expires_at > now())
    and e.created_at > now() - make_interval(mins => p_window_minutes)
  group by i.id, i.severity, e.ip_hash
$$;

-- Creates a finding, or refreshes the open one for the same rule and subject. Returns true when it is new.
create or replace function public.kd_siem_open_finding(p_rule text, p_severity text, p_subject text, p_count integer, p_first timestamptz, p_last timestamptz, p_evidence jsonb, p_company uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  insert into public.siem_findings as f (company_id, rule_id, severity, subject_ref, event_count, first_event_at, last_event_at, evidence)
  values (p_company, p_rule, p_severity, p_subject, p_count, p_first, p_last, p_evidence)
  on conflict (rule_id, subject_ref) where deleted_at is null and status <> 'closed'
  do update set event_count = excluded.event_count, last_event_at = excluded.last_event_at, evidence = excluded.evidence,
    severity = excluded.severity, updated_at = now()
  returning (xmax = 0) into inserted;
  return coalesce(inserted, false);
end
$$;

revoke all on function public.kd_siem_fetch(uuid, text, integer), public.kd_siem_delivery_result(uuid, uuid, text),
  public.kd_siem_correlate(text[], text, integer, integer), public.kd_siem_ioc_hits(integer),
  public.kd_siem_open_finding(text, text, text, integer, timestamptz, timestamptz, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.kd_siem_fetch(uuid, text, integer), public.kd_siem_delivery_result(uuid, uuid, text),
  public.kd_siem_correlate(text[], text, integer, integer), public.kd_siem_ioc_hits(integer),
  public.kd_siem_open_finding(text, text, text, integer, timestamptz, timestamptz, jsonb, uuid) to service_role;
