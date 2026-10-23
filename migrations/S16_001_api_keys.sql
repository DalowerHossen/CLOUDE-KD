-- path: migrations/S16_001_api_keys.sql
-- STEP 16.1.a Public API.
--   api_keys             a key of the public API: only the hash is stored (the secret is shown once), with scopes, mode (live or
--                        sandbox), expiry, a per-minute limit and the link to the key it replaced when rotated.
--   api_key_windows      one counter per key and minute (the rate limit).
--   api_key_usage        requests and errors per key and day (usage page and anomaly check).
--   api_sandbox_records  the data a sandbox key sees: its own documents, never read from or written to the live tables.

create table if not exists public.api_keys (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null check (char_length(key_prefix) between 8 and 24),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  last_chars text not null check (char_length(last_chars) = 4),
  mode text not null default 'live' check (mode in ('live', 'sandbox')),
  scopes text[] not null check (cardinality(scopes) between 1 and 40),
  rate_limit_per_minute integer not null default 120 check (rate_limit_per_minute between 1 and 10000),
  expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from uuid references public.api_keys (id) on delete restrict,
  created_by uuid,
  last_used_at timestamptz,
  last_used_ip text check (last_used_ip is null or char_length(last_used_ip) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((mode = 'sandbox') = (key_prefix like 'kd\_test\_%'))
);

create table if not exists public.api_key_windows (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  key_id uuid not null references public.api_keys (id) on delete restrict,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.api_key_usage (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  key_id uuid not null references public.api_keys (id) on delete restrict,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  errors integer not null default 0 check (errors >= 0 and errors <= requests),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.api_sandbox_records (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  resource text not null check (resource in ('clients', 'products', 'invoices', 'estimates', 'payments')),
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.api_keys');
select public.apply_standard_triggers('public.api_sandbox_records');
select public.rls_enable_default_deny('public.api_keys');
select public.rls_enable_default_deny('public.api_key_windows');
select public.rls_enable_default_deny('public.api_key_usage');
select public.rls_enable_default_deny('public.api_sandbox_records');
select public.audit_enable_for('public.api_keys');

create unique index if not exists uq_api_keys_hash on public.api_keys (key_hash);
create index if not exists ix_api_keys_company on public.api_keys (company_id, created_at desc) where deleted_at is null;
create unique index if not exists uq_api_key_windows on public.api_key_windows (key_id, window_start);
create index if not exists ix_api_key_windows_start on public.api_key_windows (window_start);
create unique index if not exists uq_api_key_usage on public.api_key_usage (key_id, day);
create index if not exists ix_api_sandbox_records on public.api_sandbox_records (company_id, resource, created_at desc) where deleted_at is null;

-- What identifies and limits a key never changes; a revoked key stays revoked; a replaced key belongs to the same company.
create or replace function public.kd_api_key_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'UPDATE' then
    if new.key_hash is distinct from old.key_hash or new.key_prefix is distinct from old.key_prefix
       or new.last_chars is distinct from old.last_chars or new.mode is distinct from old.mode
       or new.company_id is distinct from old.company_id or new.rotated_from is distinct from old.rotated_from then
      raise exception 'the identity of an API key does not change' using errcode = '55000';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'a revoked key stays revoked' using errcode = '55000';
    end if;
  end if;
  if new.rotated_from is not null then
    select company_id into v_company from public.api_keys where id = new.rotated_from;
    if v_company is null or v_company <> new.company_id then
      raise exception 'the replaced key was not found' using errcode = 'P0002';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_api_keys_guard on public.api_keys;
create trigger trg_api_keys_guard before insert or update on public.api_keys for each row execute function public.kd_api_key_guard();

-- One more request in the current minute for a key. Returns the count including this request.
create or replace function public.kd_api_key_hit(p_key uuid, p_company uuid, p_window timestamptz) returns integer
language plpgsql
set search_path = public
as $$
declare v_hits integer;
begin
  insert into public.api_key_windows (company_id, key_id, window_start, hits) values (p_company, p_key, p_window, 1)
    on conflict (key_id, window_start) do update set hits = public.api_key_windows.hits + 1, updated_at = now()
    returning hits into v_hits;
  return v_hits;
end
$$;

-- One more request (and perhaps an error) in the day of a key. Returns the requests of the day including this one.
create or replace function public.kd_api_key_usage_add(p_key uuid, p_company uuid, p_day date, p_error boolean) returns integer
language plpgsql
set search_path = public
as $$
declare v_requests integer;
begin
  insert into public.api_key_usage (company_id, key_id, day, requests, errors)
    values (p_company, p_key, p_day, 1, case when p_error then 1 else 0 end)
    on conflict (key_id, day) do update
      set requests = public.api_key_usage.requests + 1,
          errors = public.api_key_usage.errors + case when p_error then 1 else 0 end,
          updated_at = now()
    returning requests into v_requests;
  return v_requests;
end
$$;
