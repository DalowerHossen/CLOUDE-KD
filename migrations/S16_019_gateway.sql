-- path: migrations/S16_019_gateway.sql
-- STEP 16.12.a Sub-merchant gateway.
--   gateway_upstreams     the app of the main merchant that sub-merchant calls are sent to (one per company), with the sealed signing secret.
--   gateway_routes        the method and path templates a sub-merchant may call.
--   sub_merchants         the sub-merchants of the company.
--   sub_merchant_keys     their keys (only the hash is kept), limit per minute, optional address allow list.
--   gateway_calls         append-only log, one row per call, no bodies.
--   gateway_key_windows   requests per key per minute window.

create table if not exists public.gateway_upstreams (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  base_url text not null check (char_length(base_url) between 12 and 500 and base_url ~ '^https://'),
  secret_enc jsonb not null check (jsonb_typeof(secret_enc) = 'object'),
  secret_last4 text not null check (char_length(secret_last4) = 4),
  previous_secret_enc jsonb check (previous_secret_enc is null or jsonb_typeof(previous_secret_enc) = 'object'),
  previous_secret_expires_at timestamptz,
  timeout_ms integer not null default 15000 check (timeout_ms between 1000 and 30000),
  enabled boolean not null default true,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((previous_secret_enc is null) = (previous_secret_expires_at is null))
);

create table if not exists public.gateway_routes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path_template text not null check (char_length(path_template) between 1 and 200 and path_template ~ '^/[A-Za-z0-9._~{}/-]*$' and path_template !~ '//' and path_template !~ '(^|/)\.\.?(/|$)'),
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sub_merchants (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  reference text not null check (reference ~ '^[A-Za-z0-9._:-]{1,64}$'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  route_ids uuid[] check (route_ids is null or cardinality(route_ids) <= 200),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sub_merchant_keys (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid not null references public.sub_merchants (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null check (char_length(key_prefix) between 6 and 20),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  last_chars text not null check (char_length(last_chars) = 4),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 10000),
  allowed_ips text[] check (allowed_ips is null or cardinality(allowed_ips) <= 20),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.gateway_calls (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid references public.sub_merchants (id) on delete restrict,
  key_id uuid references public.sub_merchant_keys (id) on delete restrict,
  route_id uuid references public.gateway_routes (id) on delete restrict,
  method text not null check (char_length(method) <= 10),
  path_template text not null default '' check (char_length(path_template) <= 200),
  status_code integer check (status_code is null or status_code between 100 and 599),
  outcome text not null check (outcome in ('ok', 'client_error', 'upstream_error', 'timeout', 'blocked', 'rate_limited', 'not_found')),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  request_bytes integer not null default 0 check (request_bytes >= 0),
  response_bytes integer not null default 0 check (response_bytes >= 0),
  correlation_id text not null default '' check (char_length(correlation_id) <= 100),
  created_at timestamptz not null default now()
  -- guard:append-only (call log; rows are never changed)
);

create table if not exists public.gateway_key_windows (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  key_id uuid not null references public.sub_merchant_keys (id) on delete restrict,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.gateway_upstreams');
select public.apply_standard_triggers('public.gateway_routes');
select public.apply_standard_triggers('public.sub_merchants');
select public.apply_standard_triggers('public.sub_merchant_keys');
select public.apply_standard_triggers('public.gateway_key_windows');
select public.rls_enable_default_deny('public.gateway_upstreams');
select public.rls_enable_default_deny('public.gateway_routes');
select public.rls_enable_default_deny('public.sub_merchants');
select public.rls_enable_default_deny('public.sub_merchant_keys');
select public.rls_enable_default_deny('public.gateway_calls');
select public.rls_enable_default_deny('public.gateway_key_windows');
select public.audit_enable_for('public.gateway_upstreams');
select public.audit_enable_for('public.gateway_routes');
select public.audit_enable_for('public.sub_merchants');
select public.audit_enable_for('public.sub_merchant_keys');

create unique index if not exists uq_gateway_upstream_company on public.gateway_upstreams (company_id) where deleted_at is null;
create unique index if not exists uq_gateway_route on public.gateway_routes (company_id, method, path_template) where deleted_at is null;
create unique index if not exists uq_sub_merchant_ref on public.sub_merchants (company_id, reference) where deleted_at is null;
create unique index if not exists uq_gateway_windows on public.gateway_key_windows (key_id, window_start);
create unique index if not exists uq_sub_merchant_key_hash on public.sub_merchant_keys (key_hash);
create index if not exists ix_sub_merchants_company on public.sub_merchants (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_sub_merchant_keys_sub on public.sub_merchant_keys (sub_merchant_id) where deleted_at is null;
create index if not exists ix_gateway_calls_company on public.gateway_calls (company_id, created_at desc);
create index if not exists ix_gateway_calls_sub on public.gateway_calls (sub_merchant_id, created_at desc);

-- A child row belongs to the company of its parent, and the parent does not change.
create or replace function public.kd_gateway_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'the company of a row does not change' using errcode = '55000';
  end if;
  if tg_table_name = 'sub_merchant_keys' then
    select company_id into v_company from public.sub_merchants where id = new.sub_merchant_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the sub-merchant was not found' using errcode = 'P0002'; end if;
    if tg_op = 'UPDATE' and (new.sub_merchant_id is distinct from old.sub_merchant_id or new.key_hash is distinct from old.key_hash) then
      raise exception 'the owner and the secret of a key do not change' using errcode = '55000';
    end if;
  elsif tg_table_name = 'gateway_calls' then
    if new.sub_merchant_id is not null then
      select company_id into v_company from public.sub_merchants where id = new.sub_merchant_id;
      if v_company is null or v_company <> new.company_id then raise exception 'the sub-merchant was not found' using errcode = 'P0002'; end if;
    end if;
    if new.key_id is not null then
      select company_id into v_company from public.sub_merchant_keys where id = new.key_id;
      if v_company is null or v_company <> new.company_id then raise exception 'the key was not found' using errcode = 'P0002'; end if;
    end if;
    if new.route_id is not null then
      select company_id into v_company from public.gateway_routes where id = new.route_id;
      if v_company is null or v_company <> new.company_id then raise exception 'the route was not found' using errcode = 'P0002'; end if;
    end if;
  elsif tg_table_name = 'sub_merchants' and tg_op = 'UPDATE' and old.status = 'closed' and new.status <> 'closed' then
    raise exception 'a closed sub-merchant stays closed' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_sub_merchant_keys_guard on public.sub_merchant_keys;
create trigger trg_sub_merchant_keys_guard before insert or update on public.sub_merchant_keys for each row execute function public.kd_gateway_guard();
drop trigger if exists trg_gateway_calls_guard on public.gateway_calls;
create trigger trg_gateway_calls_guard before insert on public.gateway_calls for each row execute function public.kd_gateway_guard();
drop trigger if exists trg_sub_merchants_guard on public.sub_merchants;
create trigger trg_sub_merchants_guard before update on public.sub_merchants for each row execute function public.kd_gateway_guard();
drop trigger if exists trg_gateway_upstreams_guard on public.gateway_upstreams;
create trigger trg_gateway_upstreams_guard before update on public.gateway_upstreams for each row execute function public.kd_gateway_guard();

-- The call log never changes.
create or replace function public.kd_gateway_calls_append() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('kd.allow_hard_delete', true) = 'on' and tg_op = 'DELETE' then return old; end if;
  raise exception 'the gateway call log is append-only' using errcode = '55000';
end
$$;
drop trigger if exists trg_gateway_calls_append on public.gateway_calls;
create trigger trg_gateway_calls_append before update or delete on public.gateway_calls for each row execute function public.kd_gateway_calls_append();

-- One more request in the minute window of a key. Returns the requests of the window including this one.
create or replace function public.kd_gateway_hit(p_key uuid, p_company uuid, p_window timestamptz) returns integer
language plpgsql
set search_path = public
as $$
declare v_hits integer;
begin
  insert into public.gateway_key_windows (company_id, key_id, window_start, hits) values (p_company, p_key, p_window, 1)
    on conflict (key_id, window_start) do update set hits = public.gateway_key_windows.hits + 1, updated_at = now()
    returning hits into v_hits;
  return v_hits;
end
$$;

revoke all on public.gateway_upstreams, public.gateway_routes, public.sub_merchants, public.sub_merchant_keys, public.gateway_calls, public.gateway_key_windows from authenticated;
grant all on public.gateway_upstreams, public.gateway_routes, public.sub_merchants, public.sub_merchant_keys, public.gateway_calls, public.gateway_key_windows to service_role;
revoke all on function public.kd_gateway_guard(), public.kd_gateway_calls_append(), public.kd_gateway_hit(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.kd_gateway_guard(), public.kd_gateway_calls_append(), public.kd_gateway_hit(uuid, uuid, timestamptz) to service_role;
