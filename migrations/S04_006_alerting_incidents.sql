-- path: migrations/S04_006_alerting_incidents.sql
-- STEP 04.11 Alerts (dedupe, silence, escalation), notification channels, on-call roster, incidents with timeline.

create table if not exists public.alerts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  rule_id text not null check (rule_id ~ '^[a-z][a-z0-9_.]*$'),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null check (char_length(title) between 3 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  occurrences integer not null default 1 check (occurrences >= 1),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  notified_at timestamptz,
  escalation_level integer not null default 0 check (escalation_level between 0 and 2),
  next_escalation_at timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  incident_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.alert_silences (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  rule_id text not null check (rule_id = '*' or rule_id ~ '^[a-z][a-z0-9_.]*$'),
  reason text not null check (char_length(reason) between 3 and 300),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);

create table if not exists public.alert_channels (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('slack', 'discord', 'webhook', 'pagerduty', 'sms_gateway')),
  target text not null check (target ~ '^https://' and char_length(target) <= 500),
  credential jsonb,
  min_severity text not null default 'high' check (min_severity in ('low', 'medium', 'high', 'critical')),
  from_level integer not null default 0 check (from_level between 0 and 2),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.oncall_roster (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  level integer not null default 0 check (level between 0 and 2),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.incidents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  number bigint generated always as identity,
  title text not null check (char_length(title) between 3 and 200),
  severity text not null check (severity in ('SEV1', 'SEV2', 'SEV3', 'SEV4')),
  status text not null default 'detected' check (status in ('detected', 'acknowledged', 'mitigating', 'resolved', 'closed')),
  started_at timestamptz not null default now(),
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  mitigated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  commander_user_id uuid,
  summary text not null default '' check (char_length(summary) <= 4000),
  impact text not null default '' check (char_length(impact) <= 4000),
  root_cause text not null default '' check (char_length(root_cause) <= 4000),
  postmortem text not null default '' check (char_length(postmortem) <= 20000),
  source_alert_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (started_at <= detected_at)
);

create table if not exists public.incident_events (
  -- guard:append-only (incident timeline; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  incident_id uuid not null references public.incidents (id) on delete restrict,
  kind text not null check (kind in ('opened', 'status', 'note', 'alert_linked', 'updated')),
  actor_user_id uuid,
  body text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.alerts');
select public.apply_standard_triggers('public.alert_silences');
select public.apply_standard_triggers('public.alert_channels');
select public.apply_standard_triggers('public.oncall_roster');
select public.apply_standard_triggers('public.incidents');
select public.rls_enable_default_deny('public.alerts');
select public.rls_enable_default_deny('public.alert_silences');
select public.rls_enable_default_deny('public.alert_channels');
select public.rls_enable_default_deny('public.oncall_roster');
select public.rls_enable_default_deny('public.incidents');
select public.rls_enable_default_deny('public.incident_events');
select public.audit_enable_for('public.alert_silences');
select public.audit_enable_for('public.alert_channels');
select public.audit_enable_for('public.oncall_roster');
select public.audit_enable_for('public.incidents');

create unique index if not exists uq_alerts_open on public.alerts (dedupe_key) where deleted_at is null and status <> 'resolved';
create index if not exists ix_alerts_time on public.alerts (last_at desc);
create index if not exists ix_alerts_escalation on public.alerts (next_escalation_at) where deleted_at is null and status = 'open';
create index if not exists ix_incidents_time on public.incidents (detected_at desc);
create index if not exists ix_incident_events_incident on public.incident_events (incident_id, created_at);
create index if not exists ix_oncall_level on public.oncall_roster (level) where deleted_at is null;

drop trigger if exists trg_incident_events_immutable on public.incident_events;
create trigger trg_incident_events_immutable before update or delete on public.incident_events
  for each row execute function public.audit_block_change();
drop trigger if exists trg_incident_events_no_truncate on public.incident_events;
create trigger trg_incident_events_no_truncate before truncate on public.incident_events
  for each statement execute function public.audit_block_change();

revoke all on public.alerts, public.alert_silences, public.alert_channels, public.oncall_roster, public.incidents, public.incident_events from authenticated;
grant all on public.alerts, public.alert_silences, public.alert_channels, public.oncall_roster, public.incidents, public.incident_events to service_role;

-- Raises an alert. Same dedupe key: the open alert counts the repeat and notifies again only after the dedupe window.
-- A silence mutes every severity except critical.
create or replace function public.kd_alert_raise(p_rule text, p_severity text, p_title text, p_body text, p_dedupe text, p_company uuid, p_dedupe_seconds integer, p_escalate_seconds integer) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.alerts%rowtype;
  muted boolean;
  notify boolean;
  is_new boolean := false;
begin
  muted := p_severity <> 'critical' and exists (
    select 1 from public.alert_silences s
    where s.deleted_at is null and now() between s.starts_at and s.ends_at and (s.rule_id = '*' or s.rule_id = p_rule));
  select * into a from public.alerts where dedupe_key = p_dedupe and deleted_at is null and status <> 'resolved' for update;
  if found then
    notify := not muted and (a.notified_at is null or a.notified_at < now() - make_interval(secs => p_dedupe_seconds));
    update public.alerts set occurrences = occurrences + 1, last_at = now(), updated_at = now(),
      severity = case when public.kd_severity_rank(p_severity) > public.kd_severity_rank(severity) then p_severity else severity end,
      notified_at = case when notify then now() else notified_at end
      where id = a.id;
  else
    is_new := true;
    notify := not muted;
    insert into public.alerts (company_id, rule_id, severity, title, body, dedupe_key, notified_at, next_escalation_at)
    values (p_company, p_rule, p_severity, left(p_title, 200), left(p_body, 1000), p_dedupe,
      case when notify then now() end, now() + make_interval(secs => p_escalate_seconds))
    returning * into a;
  end if;
  return jsonb_build_object('id', a.id, 'isNew', is_new, 'notify', notify, 'silenced', muted);
end
$$;

create or replace function public.kd_alert_ack(p_id uuid, p_user uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.alerts set status = 'acknowledged', acknowledged_by = p_user, acknowledged_at = now(), next_escalation_at = null, updated_at = now()
  where id = p_id and deleted_at is null and status = 'open';
  return found;
end
$$;

create or replace function public.kd_alert_resolve(p_id uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.alerts set status = 'resolved', next_escalation_at = null, updated_at = now()
  where id = p_id and deleted_at is null and status <> 'resolved';
  return found;
end
$$;

-- Moves every unacknowledged alert that is due to the next level (at most level 2) and returns them.
create or replace function public.kd_alert_escalate(p_interval_seconds integer) returns table (id uuid, severity text, title text, body text, level integer)
language sql security definer
set search_path = public
as $$
  update public.alerts a set escalation_level = a.escalation_level + 1, notified_at = now(),
    next_escalation_at = case when a.escalation_level + 1 >= 2 then null else now() + make_interval(secs => p_interval_seconds) end,
    updated_at = now()
  where a.deleted_at is null and a.status = 'open' and a.escalation_level < 2 and a.next_escalation_at <= now()
  returning a.id, a.severity, a.title, a.body, a.escalation_level
$$;

-- Legal moves of the incident lifecycle. Closing a SEV1 or SEV2 incident needs a post-mortem.
create or replace function public.kd_incident_transition(p_id uuid, p_status text, p_actor uuid, p_note text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  i public.incidents%rowtype;
  ok boolean;
begin
  select * into i from public.incidents where id = p_id and deleted_at is null for update;
  if not found then return false; end if;
  ok := (i.status = 'detected' and p_status in ('acknowledged', 'resolved'))
     or (i.status = 'acknowledged' and p_status in ('mitigating', 'resolved'))
     or (i.status = 'mitigating' and p_status = 'resolved')
     or (i.status = 'resolved' and p_status in ('closed', 'mitigating'));
  if not ok then raise exception 'illegal transition % to %', i.status, p_status using errcode = '22023'; end if;
  if p_status = 'closed' and i.severity in ('SEV1', 'SEV2') and char_length(btrim(i.postmortem)) < 20 then
    raise exception 'post-mortem required' using errcode = '22023';
  end if;
  update public.incidents set status = p_status, updated_at = now(),
    acknowledged_at = case when p_status = 'acknowledged' then coalesce(acknowledged_at, now()) else acknowledged_at end,
    commander_user_id = case when p_status = 'acknowledged' then coalesce(commander_user_id, p_actor) else commander_user_id end,
    mitigated_at = case when p_status in ('mitigating', 'resolved') then coalesce(mitigated_at, now()) else mitigated_at end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
    closed_at = case when p_status = 'closed' then now() else closed_at end
  where id = p_id;
  insert into public.incident_events (company_id, incident_id, kind, actor_user_id, body)
  values (i.company_id, p_id, 'status', p_actor, left(p_status || coalesce(': ' || nullif(p_note, ''), ''), 4000));
  return true;
end
$$;

-- Averages over incidents detected in the last p_days: time to detect, acknowledge and resolve, in minutes.
create or replace function public.kd_incident_metrics(p_days integer) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where status in ('detected', 'acknowledged', 'mitigating')),
    'mttd_minutes', round(avg(extract(epoch from (detected_at - started_at)) / 60.0)::numeric, 1),
    'mtta_minutes', round(avg(extract(epoch from (acknowledged_at - detected_at)) / 60.0) filter (where acknowledged_at is not null)::numeric, 1),
    'mttr_minutes', round(avg(extract(epoch from (resolved_at - detected_at)) / 60.0) filter (where resolved_at is not null)::numeric, 1))
  from public.incidents
  where deleted_at is null and detected_at > now() - make_interval(days => greatest(p_days, 1))
$$;

revoke all on function public.kd_alert_raise(text, text, text, text, text, uuid, integer, integer), public.kd_alert_ack(uuid, uuid),
  public.kd_alert_resolve(uuid), public.kd_alert_escalate(integer), public.kd_incident_transition(uuid, text, uuid, text),
  public.kd_incident_metrics(integer) from public, anon, authenticated;
grant execute on function public.kd_alert_raise(text, text, text, text, text, uuid, integer, integer), public.kd_alert_ack(uuid, uuid),
  public.kd_alert_resolve(uuid), public.kd_alert_escalate(integer), public.kd_incident_transition(uuid, text, uuid, text),
  public.kd_incident_metrics(integer) to service_role;
