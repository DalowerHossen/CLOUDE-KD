-- path: migrations/S02_003_locks.sql
-- STEP 02.4 Concurrency base: lease locks (work across pooled and serverless connections) and the generic versioned update.

create table if not exists public.lock_leases (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  lock_key text not null check (char_length(lock_key) between 1 and 300),
  owner_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.rls_enable_default_deny('public.lock_leases');
create unique index if not exists uq_lock_leases_key on public.lock_leases (lock_key);
create index if not exists ix_lock_leases_expiry on public.lock_leases (expires_at);
revoke all on public.lock_leases from authenticated;
grant all on public.lock_leases to service_role;

-- Acquire: succeeds when the key is free or the previous lease expired. Returns true when this owner now holds the lease.
create or replace function public.kd_acquire_lease(p_key text, p_owner uuid, p_ttl_seconds integer, p_company uuid default null)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if p_ttl_seconds < 1 or p_ttl_seconds > 3600 then
    raise exception 'ttl must be between 1 and 3600 seconds' using errcode = '22023';
  end if;
  insert into public.lock_leases as l (lock_key, owner_token, expires_at, company_id)
  values (p_key, p_owner, now() + make_interval(secs => p_ttl_seconds), p_company)
  on conflict (lock_key) do update
    set owner_token = excluded.owner_token, expires_at = excluded.expires_at, company_id = excluded.company_id
    where l.expires_at < now() or l.owner_token = excluded.owner_token
  returning true into ok;
  return coalesce(ok, false);
end
$$;

create or replace function public.kd_release_lease(p_key text, p_owner uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.lock_leases set expires_at = now() - interval '1 second'
  where lock_key = p_key and owner_token = p_owner;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Generic optimistic update. Runs with the caller's rights, so RLS decides which rows are reachable.
-- Errors: 40001 on version mismatch, 02000 when the row is not visible, 22023 on a rejected table or column.
create or replace function public.kd_update_with_version(p_table text, p_id uuid, p_expected integer, p_patch jsonb)
returns integer
language plpgsql security invoker
set search_path = public
as $$
declare
  protected text[] := array['id', 'company_id', 'version', 'created_at', 'updated_at', 'deleted_at'];
  key text;
  sets text := '';
  new_version integer;
  has_cols integer;
begin
  select count(*) into has_cols from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name in ('id', 'version');
  if has_cols <> 2 then
    raise exception 'table % does not support versioned updates', p_table using errcode = '22023';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'patch must be a non-empty object' using errcode = '22023';
  end if;
  for key in select jsonb_object_keys(p_patch) loop
    if key = any (protected) or not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = key
    ) then
      raise exception 'column % cannot be patched', key using errcode = '22023';
    end if;
    sets := sets || format('%I = r.%I, ', key, key);
  end loop;
  execute format(
    'update public.%I t set %s version = t.version + 1 from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 and t.version = $3 and t.deleted_at is null returning t.version',
    p_table, sets, p_table
  ) into new_version using p_patch, p_id, p_expected;
  if new_version is null then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  return new_version;
end
$$;

grant execute on function public.kd_acquire_lease(text, uuid, integer, uuid), public.kd_release_lease(text, uuid) to service_role;
revoke execute on function public.kd_acquire_lease(text, uuid, integer, uuid), public.kd_release_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.kd_update_with_version(text, uuid, integer, jsonb) to authenticated, service_role;
