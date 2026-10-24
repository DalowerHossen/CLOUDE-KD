-- path: migrations/S04_001_rate_limits_events.sql
-- STEP 04.4 Rate limiting (atomic fixed-window counter), IP bans, security events, API idempotency functions.

create table if not exists public.rate_limits (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  rate_key text not null check (char_length(rate_key) between 1 and 300),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.ip_blocks (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  ip_masked text,
  reason text not null check (char_length(reason) between 1 and 200),
  blocked_until timestamptz,
  permanent boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (permanent or blocked_until is not null)
);

create table if not exists public.security_events (
  -- guard:append-only (security history; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*$'),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  source text not null default 'app' check (char_length(source) <= 60),
  actor_user_id uuid,
  ip_hash text,
  ip_masked text,
  details jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

select public.rls_enable_default_deny('public.rate_limits');
select public.rls_enable_default_deny('public.ip_blocks');
select public.rls_enable_default_deny('public.security_events');

create unique index if not exists uq_rate_limits_window on public.rate_limits (rate_key, window_start);
create index if not exists ix_rate_limits_start on public.rate_limits (window_start);
create unique index if not exists uq_ip_blocks_live on public.ip_blocks (ip_hash) where deleted_at is null;
create index if not exists ix_security_events_time on public.security_events (created_at desc);
create index if not exists ix_security_events_type on public.security_events (event_type, created_at desc);
create index if not exists ix_security_events_ip on public.security_events (ip_hash, created_at desc);

drop trigger if exists trg_security_events_immutable on public.security_events;
create trigger trg_security_events_immutable before update or delete on public.security_events
  for each row execute function public.audit_block_change();
drop trigger if exists trg_security_events_no_truncate on public.security_events;
create trigger trg_security_events_no_truncate before truncate on public.security_events
  for each statement execute function public.audit_block_change();

-- Access: platform staff with a security role read events and blocks through the service role in server code.
revoke all on public.rate_limits, public.ip_blocks, public.security_events from authenticated;
grant all on public.rate_limits, public.ip_blocks, public.security_events to service_role;

-- Atomic counter: one statement increments the window row, so parallel requests cannot slip past the limit.
create or replace function public.kd_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  total integer;
  reset_in integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid policy' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (rate_key, window_start, hits) values (p_key, win, 1)
  on conflict (rate_key, window_start) do update set hits = r.hits + 1, updated_at = now()
  returning hits into total;
  reset_in := greatest(1, ceil(extract(epoch from (win + make_interval(secs => p_window_seconds) - now())))::integer);
  return jsonb_build_object('allowed', total <= p_limit, 'remaining', greatest(p_limit - total, 0), 'retryAfterSeconds', case when total <= p_limit then 0 else reset_in end, 'hits', total);
end
$$;

create or replace function public.kd_ip_block(p_ip_hash text, p_ip_masked text, p_reason text, p_seconds integer, p_permanent boolean, p_by uuid) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare bid uuid;
begin
  insert into public.ip_blocks as b (ip_hash, ip_masked, reason, blocked_until, permanent, created_by)
  values (p_ip_hash, p_ip_masked, p_reason, case when p_permanent then null else now() + make_interval(secs => p_seconds) end, p_permanent, p_by)
  on conflict (ip_hash) where deleted_at is null do update
    set reason = excluded.reason, permanent = b.permanent or excluded.permanent,
        blocked_until = case when b.permanent or excluded.permanent then null else greatest(coalesce(b.blocked_until, now()), excluded.blocked_until) end
  returning id into bid;
  return bid;
end
$$;

create or replace function public.kd_ip_is_blocked(p_ip_hash text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.ip_blocks where ip_hash = p_ip_hash and deleted_at is null
    and (permanent or blocked_until > now()))
$$;

create or replace function public.kd_ip_unblock(p_ip_hash text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.ip_blocks set deleted_at = now() where ip_hash = p_ip_hash and deleted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

create or replace function public.kd_security_event(p_company uuid, p_type text, p_severity text, p_source text, p_actor uuid,
  p_ip_hash text, p_ip_masked text, p_details jsonb, p_correlation text) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare eid uuid;
begin
  insert into public.security_events (company_id, event_type, severity, source, actor_user_id, ip_hash, ip_masked, details, correlation_id)
  values (p_company, p_type, p_severity, left(p_source, 60), p_actor, p_ip_hash, p_ip_masked, coalesce(p_details, '{}'::jsonb), p_correlation)
  returning id into eid;
  return eid;
end
$$;

create or replace function public.kd_rate_limit_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare n1 integer; n2 integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics n1 = row_count;
  update public.ip_blocks set deleted_at = now() where deleted_at is null and not permanent and blocked_until < now() - interval '7 days';
  get diagnostics n2 = row_count;
  return n1 + n2;
end
$$;

-- API idempotency (table from S02_006). One statement decides new, replay, conflict or in progress.
create or replace function public.kd_idempotency_begin(p_scope text, p_key text, p_hash text, p_company uuid, p_ttl_seconds integer default 172800) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare r public.api_idempotency;
begin
  delete from public.api_idempotency where scope = p_scope and idempotency_key = p_key and expires_at < now();
  insert into public.api_idempotency (scope, idempotency_key, request_hash, company_id, expires_at)
  values (p_scope, p_key, p_hash, p_company, now() + make_interval(secs => p_ttl_seconds))
  on conflict (scope, idempotency_key) do nothing;
  if found then
    return jsonb_build_object('state', 'new');
  end if;
  select * into r from public.api_idempotency where scope = p_scope and idempotency_key = p_key;
  if r.request_hash <> p_hash then
    return jsonb_build_object('state', 'conflict');
  end if;
  if r.state = 'complete' then
    return jsonb_build_object('state', 'replay', 'status', r.response_status, 'body', r.response_body, 'contentType', r.content_type);
  end if;
  return jsonb_build_object('state', 'in_progress');
end
$$;

create or replace function public.kd_idempotency_complete(p_scope text, p_key text, p_status integer, p_body text, p_content_type text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.api_idempotency set state = 'complete', response_status = p_status, response_body = left(p_body, 262144), content_type = p_content_type
  where scope = p_scope and idempotency_key = p_key and state = 'in_progress';
  get diagnostics n = row_count;
  return n = 1;
end
$$;

create or replace function public.kd_idempotency_release(p_scope text, p_key text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('kd.allow_hard_delete', 'on', true);
  delete from public.api_idempotency where scope = p_scope and idempotency_key = p_key and state = 'in_progress';
  get diagnostics n = row_count;
  return n = 1;
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.kd_rate_limit_hit(text, integer, integer)', 'public.kd_ip_block(text, text, text, integer, boolean, uuid)',
    'public.kd_ip_is_blocked(text)', 'public.kd_ip_unblock(text)',
    'public.kd_security_event(uuid, text, text, text, uuid, text, text, jsonb, text)', 'public.kd_rate_limit_purge()',
    'public.kd_idempotency_begin(text, text, text, uuid, integer)', 'public.kd_idempotency_complete(text, text, integer, text, text)',
    'public.kd_idempotency_release(text, text)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
