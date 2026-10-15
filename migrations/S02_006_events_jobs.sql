-- path: migrations/S02_006_events_jobs.sql
-- STEP 02.8 Events and jobs: transactional outbox, job queue (FOR UPDATE SKIP LOCKED), retries with backoff,
-- dead letter state, and the API idempotency table used by the idempotency service of STEP 04.

create table if not exists public.domain_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (name ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  locked_by text,
  last_error text check (char_length(last_error) <= 2000),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.job_queue (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (name ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_-]+)+$'),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  locked_by text,
  dedupe_key text check (char_length(dedupe_key) <= 200),
  last_error text check (char_length(last_error) <= 2000),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.api_idempotency (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  scope text not null check (char_length(scope) between 1 and 300),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_hash text not null check (char_length(request_hash) = 64),
  state text not null default 'in_progress' check (state in ('in_progress', 'complete')),
  response_status integer check (response_status between 100 and 599),
  response_body text,
  content_type text,
  expires_at timestamptz not null default now() + interval '48 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

do $$
declare t text;
begin
  foreach t in array array['domain_events', 'job_queue', 'api_idempotency']
  loop
    perform public.apply_standard_triggers(('public.' || t)::regclass);
  end loop;
end
$$;

select public.rls_enable_default_deny('public.domain_events');
select public.rls_enable_default_deny('public.job_queue');
select public.rls_enable_default_deny('public.api_idempotency');

create index if not exists ix_domain_events_due on public.domain_events (next_attempt_at) where status in ('pending', 'failed', 'processing');
create index if not exists ix_domain_events_company on public.domain_events (company_id, occurred_at desc);
create index if not exists ix_job_queue_due on public.job_queue (run_at) where status in ('pending', 'failed', 'processing');
create unique index if not exists uq_job_queue_dedupe on public.job_queue (dedupe_key) where dedupe_key is not null and status in ('pending', 'processing', 'failed');
create unique index if not exists uq_api_idempotency_key on public.api_idempotency (scope, idempotency_key);
create index if not exists ix_api_idempotency_expiry on public.api_idempotency (expires_at);

revoke all on public.domain_events, public.job_queue, public.api_idempotency from authenticated;
grant all on public.domain_events, public.job_queue, public.api_idempotency to service_role;

-- Backoff: 30 s, 2 min, 8 min, 32 min, ... capped at 6 hours.
create or replace function public.kd_backoff(p_attempts integer) returns interval
language sql immutable parallel safe
as $$ select least(interval '6 hours', interval '30 seconds' * power(4, greatest(p_attempts - 1, 0))) $$;

create or replace function public.kd_publish_event(p_company uuid, p_name text, p_payload jsonb, p_correlation text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare eid uuid;
begin
  insert into public.domain_events (company_id, name, payload, correlation_id)
  values (p_company, p_name, coalesce(p_payload, '{}'::jsonb), p_correlation) returning id into eid;
  return eid;
end
$$;

create or replace function public.kd_claim_events(p_limit integer, p_worker text, p_lock_seconds integer default 60)
returns setof public.domain_events
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select e.id from public.domain_events e
    where e.deleted_at is null and e.next_attempt_at <= now()
      and (e.status in ('pending', 'failed') or (e.status = 'processing' and e.locked_until < now()))
    order by e.occurred_at, e.id limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.domain_events e set status = 'processing', attempts = e.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lock_seconds)
  from due where e.id = due.id returning e.*;
end
$$;

create or replace function public.kd_finish_event(p_id uuid, p_ok boolean, p_error text default null, p_max_attempts integer default 8)
returns text
language plpgsql security definer
set search_path = public
as $$
declare e public.domain_events; result text;
begin
  select * into e from public.domain_events where id = p_id for update;
  if not found then return 'missing'; end if;
  if p_ok then
    update public.domain_events set status = 'done', processed_at = now(), locked_until = null, locked_by = null, last_error = null where id = p_id;
    return 'done';
  end if;
  result := case when e.attempts >= p_max_attempts then 'dead' else 'failed' end;
  update public.domain_events set status = result, last_error = left(p_error, 2000), locked_until = null, locked_by = null,
    next_attempt_at = now() + public.kd_backoff(e.attempts) where id = p_id;
  return result;
end
$$;

create or replace function public.kd_enqueue_job(p_company uuid, p_name text, p_payload jsonb, p_run_at timestamptz default now(),
  p_max_attempts integer default 5, p_dedupe text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare jid uuid;
begin
  insert into public.job_queue (company_id, name, payload, run_at, max_attempts, dedupe_key)
  values (p_company, p_name, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), p_max_attempts, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('pending', 'processing', 'failed') do nothing
  returning id into jid;
  return jid;
end
$$;

create or replace function public.kd_claim_jobs(p_limit integer, p_worker text, p_lock_seconds integer default 120, p_names text[] default null)
returns setof public.job_queue
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id from public.job_queue j
    where j.deleted_at is null and j.run_at <= now() and (p_names is null or j.name = any (p_names))
      and (j.status in ('pending', 'failed') or (j.status = 'processing' and j.locked_until < now()))
    order by j.run_at, j.id limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.job_queue j set status = 'processing', attempts = j.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lock_seconds)
  from due where j.id = due.id returning j.*;
end
$$;

create or replace function public.kd_finish_job(p_id uuid, p_ok boolean, p_error text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare j public.job_queue; result text;
begin
  select * into j from public.job_queue where id = p_id for update;
  if not found then return 'missing'; end if;
  if p_ok then
    update public.job_queue set status = 'done', finished_at = now(), locked_until = null, locked_by = null, last_error = null where id = p_id;
    return 'done';
  end if;
  result := case when j.attempts >= j.max_attempts then 'dead' else 'failed' end;
  update public.job_queue set status = result, last_error = left(p_error, 2000), locked_until = null, locked_by = null,
    run_at = now() + public.kd_backoff(j.attempts), finished_at = case when result = 'dead' then now() end where id = p_id;
  return result;
end
$$;

-- Housekeeping: remove finished events and jobs older than 30 days and expired idempotency keys.
create or replace function public.kd_purge_queues() returns integer
language plpgsql security definer
set search_path = public
as $$
declare n1 integer; n2 integer; n3 integer;
begin
  perform set_config('kd.allow_hard_delete', 'on', true);
  delete from public.domain_events where status = 'done' and processed_at < now() - interval '30 days';
  get diagnostics n1 = row_count;
  delete from public.job_queue where status = 'done' and finished_at < now() - interval '30 days';
  get diagnostics n2 = row_count;
  delete from public.api_idempotency where expires_at < now();
  get diagnostics n3 = row_count;
  return n1 + n2 + n3;
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.kd_publish_event(uuid, text, jsonb, text)', 'public.kd_claim_events(integer, text, integer)',
    'public.kd_finish_event(uuid, boolean, text, integer)',
    'public.kd_enqueue_job(uuid, text, jsonb, timestamptz, integer, text)',
    'public.kd_claim_jobs(integer, text, integer, text[])', 'public.kd_finish_job(uuid, boolean, text)',
    'public.kd_purge_queues()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
