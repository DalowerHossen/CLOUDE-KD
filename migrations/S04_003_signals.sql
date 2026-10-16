-- path: migrations/S04_003_signals.sql
-- STEP 04.6 Device and behaviour signals: fingerprints, fraud signals (append-only) and decaying risk scores.

create table if not exists public.device_fingerprints (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  trusted boolean not null default false,
  seen_count integer not null default 1 check (seen_count >= 1),
  last_ip_hash text,
  last_country char(2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.fraud_signals (
  -- guard:append-only (signal history; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  signal_type text not null check (signal_type ~ '^[a-z][a-z0-9_]*$'),
  subject_type text not null check (subject_type in ('user', 'device', 'ip', 'company')),
  subject_ref text not null check (char_length(subject_ref) between 1 and 100),
  score_delta integer not null check (score_delta between -100 and 100),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.risk_scores (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  subject_type text not null check (subject_type in ('user', 'device', 'ip', 'company')),
  subject_ref text not null check (char_length(subject_ref) between 1 and 100),
  score numeric(6, 2) not null default 0 check (score between 0 and 100),
  factors jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.device_fingerprints');
select public.apply_standard_triggers('public.risk_scores');
select public.rls_enable_default_deny('public.device_fingerprints');
select public.rls_enable_default_deny('public.fraud_signals');
select public.rls_enable_default_deny('public.risk_scores');

create unique index if not exists uq_device_fp_user on public.device_fingerprints (user_id, fingerprint_hash) where deleted_at is null;
create index if not exists ix_device_fp_fingerprint on public.device_fingerprints (fingerprint_hash) where deleted_at is null;
create index if not exists ix_fraud_signals_subject on public.fraud_signals (subject_type, subject_ref, created_at desc);
create index if not exists ix_fraud_signals_time on public.fraud_signals (created_at desc);
create unique index if not exists uq_risk_subject on public.risk_scores (subject_type, subject_ref) where deleted_at is null;
create index if not exists ix_risk_score on public.risk_scores (score desc) where deleted_at is null;

drop trigger if exists trg_fraud_signals_immutable on public.fraud_signals;
create trigger trg_fraud_signals_immutable before update or delete on public.fraud_signals
  for each row execute function public.audit_block_change();
drop trigger if exists trg_fraud_signals_no_truncate on public.fraud_signals;
create trigger trg_fraud_signals_no_truncate before truncate on public.fraud_signals
  for each statement execute function public.audit_block_change();

revoke all on public.device_fingerprints, public.fraud_signals, public.risk_scores from authenticated;
grant all on public.device_fingerprints, public.fraud_signals, public.risk_scores to service_role;

-- A risk score loses 10 percent per day without new signals.
create or replace function public.kd_risk_effective(p_score numeric, p_scored_at timestamptz) returns numeric
language sql immutable
as $$ select round(p_score * power(0.9, greatest(extract(epoch from (now() - p_scored_at)) / 86400.0, 0)), 2) $$;

-- Adds a signal and moves the score of the subject in one statement. Returns the new effective score.
create or replace function public.kd_risk_add(p_type text, p_subject_type text, p_ref text, p_delta integer, p_company uuid, p_details jsonb) returns numeric
language plpgsql security definer
set search_path = public
as $$
declare current_score numeric := 0; next_score numeric; r public.risk_scores;
begin
  insert into public.fraud_signals (company_id, signal_type, subject_type, subject_ref, score_delta, details)
  values (p_company, p_type, p_subject_type, p_ref, p_delta, coalesce(p_details, '{}'::jsonb));
  insert into public.risk_scores (company_id, subject_type, subject_ref, score) values (p_company, p_subject_type, p_ref, 0)
  on conflict (subject_type, subject_ref) where deleted_at is null do nothing;
  select * into r from public.risk_scores where subject_type = p_subject_type and subject_ref = p_ref and deleted_at is null for update;
  current_score := public.kd_risk_effective(r.score, r.scored_at);
  next_score := least(100, greatest(0, current_score + p_delta));
  update public.risk_scores set score = next_score, scored_at = now(),
    factors = jsonb_set(coalesce(factors, '{}'::jsonb), array[p_type], to_jsonb(coalesce((factors ->> p_type)::int, 0) + 1))
  where id = r.id;
  return next_score;
end
$$;

create or replace function public.kd_risk_get(p_subject_type text, p_ref text) returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce((select public.kd_risk_effective(score, scored_at) from public.risk_scores
    where subject_type = p_subject_type and subject_ref = p_ref and deleted_at is null), 0)
$$;

create or replace function public.kd_risk_clear(p_subject_type text, p_ref text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.risk_scores set score = 0, scored_at = now(), factors = '{}'::jsonb where subject_type = p_subject_type and subject_ref = p_ref and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Device record: counts how often a fingerprint is seen and by how many accounts (device reuse).
create or replace function public.kd_device_seen(p_user uuid, p_company uuid, p_device_hash text, p_fingerprint text, p_ip_hash text, p_country text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare isnew boolean := false; users_on_fp integer; r public.device_fingerprints;
begin
  insert into public.device_fingerprints (user_id, company_id, device_hash, fingerprint_hash, last_ip_hash, last_country)
  values (p_user, p_company, p_device_hash, p_fingerprint, p_ip_hash, nullif(p_country, ''))
  on conflict (user_id, fingerprint_hash) where deleted_at is null do update
    set seen_count = device_fingerprints.seen_count + 1, last_seen_at = now(), last_ip_hash = excluded.last_ip_hash,
        last_country = coalesce(excluded.last_country, device_fingerprints.last_country), device_hash = excluded.device_hash
  returning * into r;
  isnew := r.seen_count = 1;
  select count(distinct user_id) into users_on_fp from public.device_fingerprints where fingerprint_hash = p_fingerprint and deleted_at is null;
  return jsonb_build_object('isNew', isnew, 'trusted', r.trusted, 'usersOnFingerprint', users_on_fp, 'seenCount', r.seen_count);
end
$$;

-- Same address used by several accounts inside a window (sign-ups and sign-ins from login events).
create or replace function public.kd_users_for_ip(p_ip_hash text, p_hours integer) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(distinct user_id)::integer from public.auth_login_events
  where ip_hash = p_ip_hash and user_id is not null and created_at > now() - make_interval(hours => p_hours)
    and event_type in ('login_success', 'signup', 'oauth_login')
$$;

create or replace function public.kd_signups_for_ip(p_ip_hash text, p_hours integer) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.auth_login_events
  where ip_hash = p_ip_hash and event_type = 'signup' and created_at > now() - make_interval(hours => p_hours)
$$;

-- Latest country of a user from earlier devices (for the country jump check).
create or replace function public.kd_last_country(p_user uuid) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce((select jsonb_build_object('country', last_country, 'at', last_seen_at) from public.device_fingerprints
    where user_id = p_user and last_country is not null and deleted_at is null order by last_seen_at desc limit 1), 'null'::jsonb)
$$;

-- Number of actions an administrator did in the last hour (insider threat signal).
create or replace function public.kd_actor_actions(p_actor uuid, p_minutes integer) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.audit_logs where actor_user_id = p_actor and created_at > now() - make_interval(mins => p_minutes)
$$;

do $$
declare f text;
begin
  foreach f in array array['public.kd_risk_add(text, text, text, integer, uuid, jsonb)', 'public.kd_risk_get(text, text)',
    'public.kd_risk_clear(text, text)', 'public.kd_device_seen(uuid, uuid, text, text, text, text)',
    'public.kd_users_for_ip(text, integer)', 'public.kd_signups_for_ip(text, integer)', 'public.kd_last_country(uuid)',
    'public.kd_actor_actions(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Number of signals of one type for a subject inside a window (used by the fraud rules).
create or replace function public.kd_signal_count(p_subject_type text, p_ref text, p_type text, p_minutes integer) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.fraud_signals
  where subject_type = p_subject_type and subject_ref = p_ref and signal_type = p_type
    and created_at > now() - make_interval(mins => p_minutes)
$$;
revoke execute on function public.kd_signal_count(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.kd_signal_count(text, text, text, integer) to service_role;
