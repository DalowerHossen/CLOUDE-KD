-- path: migrations/S16_002_webhooks_out.sql
-- STEP 16.2 Outgoing webhooks.
--   webhook_endpoints          where a company wants events sent: https address, events, the signing secret (encrypted; the
--                              previous secret stays valid for a short overlap after a rotation), and the failure state.
--   webhook_deliveries         one row per event and endpoint (the outbox): payload, status, attempts and the next attempt.
--   webhook_delivery_attempts  one row per try: status code, clipped response, error and time taken (the delivery log).

create table if not exists public.webhook_endpoints (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  description text not null default '' check (char_length(description) <= 200),
  events text[] not null check (cardinality(events) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  source text not null default 'manual' check (source in ('manual', 'zapier', 'make')),
  secret_enc jsonb not null check (jsonb_typeof(secret_enc) = 'object'),
  secret_last4 text not null check (char_length(secret_last4) = 4),
  previous_secret_enc jsonb check (previous_secret_enc is null or jsonb_typeof(previous_secret_enc) = 'object'),
  previous_secret_expires_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((previous_secret_enc is null) = (previous_secret_expires_at is null)),
  check ((status = 'disabled') = (disabled_at is not null))
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete restrict,
  event_id text not null check (char_length(event_id) between 1 and 100),
  event_name text not null check (char_length(event_name) between 1 and 60),
  kind text not null default 'event' check (kind in ('event', 'test', 'replay')),
  replay_of uuid references public.webhook_deliveries (id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'retrying', 'dead', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 20),
  next_attempt_at timestamptz,
  locked_until timestamptz,
  last_status_code integer,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status not in ('pending', 'retrying') or next_attempt_at is not null),
  check ((status = 'succeeded') = (delivered_at is not null))
);

create table if not exists public.webhook_delivery_attempts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  delivery_id uuid not null references public.webhook_deliveries (id) on delete restrict,
  attempt integer not null check (attempt between 1 and 20),
  status_code integer,
  response_body text not null default '' check (char_length(response_body) <= 2000),
  error text check (error is null or char_length(error) <= 300),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  ok boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.webhook_endpoints');
select public.apply_standard_triggers('public.webhook_deliveries');
select public.rls_enable_default_deny('public.webhook_endpoints');
select public.rls_enable_default_deny('public.webhook_deliveries');
select public.rls_enable_default_deny('public.webhook_delivery_attempts');
select public.audit_enable_for('public.webhook_endpoints');

create index if not exists ix_webhook_endpoints_company on public.webhook_endpoints (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_webhook_endpoints_events on public.webhook_endpoints using gin (events) where deleted_at is null;
-- One automatic delivery per event and endpoint: a second delivery of the same event changes nothing.
create unique index if not exists uq_webhook_deliveries_event on public.webhook_deliveries (endpoint_id, event_id) where kind = 'event';
create index if not exists ix_webhook_deliveries_endpoint on public.webhook_deliveries (endpoint_id, created_at desc) where deleted_at is null;
create index if not exists ix_webhook_deliveries_due on public.webhook_deliveries (next_attempt_at) where status in ('pending', 'retrying') and deleted_at is null;
create unique index if not exists uq_webhook_attempts on public.webhook_delivery_attempts (delivery_id, attempt);

-- The endpoint belongs to the company of the delivery; the secret and the address never change in place by accident: the company,
-- and the delivery's event and payload, are fixed after the row exists.
create or replace function public.kd_webhook_delivery_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'INSERT' then
    select company_id into v_company from public.webhook_endpoints where id = new.endpoint_id;
    if v_company is null or v_company <> new.company_id then
      raise exception 'the endpoint was not found' using errcode = 'P0002';
    end if;
  else
    if new.company_id is distinct from old.company_id or new.endpoint_id is distinct from old.endpoint_id
       or new.event_id is distinct from old.event_id or new.payload is distinct from old.payload
       or new.kind is distinct from old.kind then
      raise exception 'a delivery keeps its endpoint, event and payload' using errcode = '55000';
    end if;
    if old.status in ('succeeded', 'dead', 'cancelled') and new.status is distinct from old.status then
      raise exception 'a finished delivery does not change' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_webhook_deliveries_guard on public.webhook_deliveries;
create trigger trg_webhook_deliveries_guard before insert or update on public.webhook_deliveries for each row execute function public.kd_webhook_delivery_guard();

-- Attempts are append only and belong to the company of their delivery.
create or replace function public.kd_webhook_attempt_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'an attempt does not change' using errcode = '55000';
  end if;
  select company_id into v_company from public.webhook_deliveries where id = new.delivery_id;
  if v_company is null or v_company <> new.company_id then
    raise exception 'the delivery was not found' using errcode = 'P0002';
  end if;
  return new;
end
$$;
drop trigger if exists trg_webhook_attempts_guard on public.webhook_delivery_attempts;
create trigger trg_webhook_attempts_guard before insert or update on public.webhook_delivery_attempts for each row execute function public.kd_webhook_attempt_guard();

-- Takes due deliveries for one worker. Rows are locked for a short time so two workers never send the same delivery.
create or replace function public.kd_claim_webhook_deliveries(p_limit integer, p_lock_seconds integer) returns setof public.webhook_deliveries
language plpgsql
set search_path = public
as $$
begin
  return query
  with due as (
    select d.id from public.webhook_deliveries d
    join public.webhook_endpoints e on e.id = d.endpoint_id
    where d.status in ('pending', 'retrying') and d.next_attempt_at <= now()
      and (d.locked_until is null or d.locked_until < now())
      and d.deleted_at is null and e.deleted_at is null and e.status = 'active'
    order by d.next_attempt_at
    limit greatest(p_limit, 1)
    for update of d skip locked
  )
  update public.webhook_deliveries d set locked_until = now() + make_interval(secs => p_lock_seconds)
  from due where d.id = due.id
  returning d.*;
end
$$;
