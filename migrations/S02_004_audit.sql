-- path: migrations/S02_004_audit.sql
-- STEP 02.5a Audit log database layer: append-only table, per-chain sequence, SHA-256 hash chain, checkpoints,
-- verification function and the generic row audit trigger. Rows hold references and hashes, never raw PII values.

create table if not exists public.audit_logs (
  -- guard:append-only (no updated_at, deleted_at or version: rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  chain_key text not null,
  sequence bigint not null,
  actor_user_id uuid,
  actor_role text,
  impersonated_by uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  resource_type text not null check (char_length(resource_type) between 1 and 100),
  resource_id uuid,
  ip_masked text,
  ip_hash text,
  user_agent_hash text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  entry_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_checkpoints (
  -- guard:append-only
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  chain_key text not null,
  from_sequence bigint not null,
  to_sequence bigint not null check (to_sequence >= from_sequence),
  entry_count integer not null check (entry_count > 0),
  merkle_root text not null,
  last_entry_hash text not null,
  signature text not null,
  key_id text not null,
  created_at timestamptz not null default now()
);

select public.rls_enable_default_deny('public.audit_logs');
select public.rls_enable_default_deny('public.audit_checkpoints');

create unique index if not exists uq_audit_logs_chain_seq on public.audit_logs (chain_key, sequence);
create index if not exists ix_audit_logs_company_time on public.audit_logs (company_id, created_at desc);
create index if not exists ix_audit_logs_resource on public.audit_logs (resource_type, resource_id);
create index if not exists ix_audit_logs_actor on public.audit_logs (actor_user_id, created_at desc);
create index if not exists ix_audit_logs_action on public.audit_logs (action);
create unique index if not exists uq_audit_checkpoints_chain_to on public.audit_checkpoints (chain_key, to_sequence);

-- Canonical text of one entry for hashing. Used by the insert trigger and by verification.
create or replace function public.audit_entry_material(r public.audit_logs) returns text
language sql immutable
set search_path = public
as $$
  select concat_ws('|',
    r.prev_hash, r.chain_key, r.sequence::text,
    to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(r.company_id::text, ''), coalesce(r.actor_user_id::text, ''), coalesce(r.actor_role, ''),
    coalesce(r.impersonated_by::text, ''), r.action, r.resource_type, coalesce(r.resource_id::text, ''),
    coalesce(r.ip_masked, ''), coalesce(r.ip_hash, ''), coalesce(r.user_agent_hash, ''),
    coalesce(r.correlation_id, ''), r.metadata::text)
$$;

create or replace function public.audit_entry_hash(r public.audit_logs) returns text
language sql immutable
set search_path = public, extensions
as $$ select encode(extensions.digest(public.audit_entry_material(r), 'sha256'), 'hex') $$;

-- BEFORE INSERT: assign the chain key, next sequence, previous hash and own hash. One writer per chain at a time.
create or replace function public.audit_chain_before_insert() returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  last_seq bigint;
  last_hash text;
begin
  new.chain_key := coalesce(new.company_id::text, 'platform');
  perform pg_advisory_xact_lock(hashtextextended('audit:' || new.chain_key, 0));
  select l.sequence, l.entry_hash into last_seq, last_hash
  from public.audit_logs l where l.chain_key = new.chain_key order by l.sequence desc limit 1;
  new.sequence := coalesce(last_seq, 0) + 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.created_at := clock_timestamp();
  new.entry_hash := public.audit_entry_hash(new);
  return new;
end
$$;

create or replace function public.audit_block_change() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit tables are append-only (% on %)', tg_op, tg_table_name using errcode = '42501';
end
$$;

drop trigger if exists trg_audit_logs_chain on public.audit_logs;
create trigger trg_audit_logs_chain before insert on public.audit_logs
  for each row execute function public.audit_chain_before_insert();
drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.audit_block_change();
drop trigger if exists trg_audit_logs_no_truncate on public.audit_logs;
create trigger trg_audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_block_change();
drop trigger if exists trg_audit_checkpoints_immutable on public.audit_checkpoints;
create trigger trg_audit_checkpoints_immutable before update or delete on public.audit_checkpoints
  for each row execute function public.audit_block_change();
drop trigger if exists trg_audit_checkpoints_no_truncate on public.audit_checkpoints;
create trigger trg_audit_checkpoints_no_truncate before truncate on public.audit_checkpoints
  for each statement execute function public.audit_block_change();

-- Append one entry (called by the AuditService with the service role).
create or replace function public.kd_audit_append(
  p_company uuid, p_actor uuid, p_role text, p_impersonated_by uuid, p_action text,
  p_resource_type text, p_resource_id uuid, p_ip_masked text, p_ip_hash text,
  p_user_agent_hash text, p_correlation text, p_metadata jsonb
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  seq bigint;
begin
  insert into public.audit_logs (company_id, actor_user_id, actor_role, impersonated_by, action, resource_type,
    resource_id, ip_masked, ip_hash, user_agent_hash, correlation_id, metadata, prev_hash, entry_hash, chain_key, sequence)
  values (p_company, p_actor, p_role, p_impersonated_by, p_action, p_resource_type, p_resource_id, p_ip_masked,
    p_ip_hash, p_user_agent_hash, p_correlation, coalesce(p_metadata, '{}'::jsonb), '', '', '', 0)
  returning sequence into seq;
  return seq;
end
$$;

-- Verification: recompute every hash in the range, check the link to the previous entry and look for sequence gaps.
create or replace function public.kd_audit_verify(p_chain text, p_from bigint default null, p_to bigint default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  r public.audit_logs;
  prev_seq bigint;
  prev_hash text;
  first_broken bigint := null;
  gaps bigint[] := '{}';
  checked_from bigint;
  checked_to bigint;
begin
  select l.sequence, l.entry_hash into prev_seq, prev_hash
  from public.audit_logs l where l.chain_key = p_chain and l.sequence < coalesce(p_from, 1)
  order by l.sequence desc limit 1;
  for r in select * from public.audit_logs l
    where l.chain_key = p_chain and l.sequence >= coalesce(p_from, 1) and l.sequence <= coalesce(p_to, 9223372036854775807)
    order by l.sequence
  loop
    checked_from := coalesce(checked_from, r.sequence);
    checked_to := r.sequence;
    if prev_seq is not null and r.sequence <> prev_seq + 1 then
      gaps := gaps || generate_series(prev_seq + 1, r.sequence - 1)::bigint;
      first_broken := coalesce(first_broken, prev_seq + 1);
    end if;
    if r.entry_hash <> public.audit_entry_hash(r) or r.prev_hash <> coalesce(prev_hash, repeat('0', 64)) then
      first_broken := coalesce(first_broken, r.sequence);
    end if;
    prev_seq := r.sequence;
    prev_hash := r.entry_hash;
  end loop;
  return jsonb_build_object('ok', first_broken is null, 'chain', p_chain, 'checkedFrom', checked_from,
    'checkedTo', checked_to, 'firstBrokenSequence', first_broken, 'gaps', to_jsonb(gaps));
end
$$;

-- Generic row audit trigger. Stores changed column NAMES only, never values, so no PII reaches the log.
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  actor uuid := nullif(claims ->> 'sub', '')::uuid;
  role_name text := nullif(claims -> 'app_metadata' ->> 'role', '');
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed text[] := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k and k not in ('updated_at', 'version') then
        changed := changed || k;
      end if;
    end loop;
    if cardinality(changed) = 0 then return new; end if;
  end if;
  insert into public.audit_logs (company_id, actor_user_id, actor_role, action, resource_type, resource_id, metadata,
    prev_hash, entry_hash, chain_key, sequence)
  values (nullif(rec ->> 'company_id', '')::uuid, actor, role_name,
    tg_table_name || '.' || lower(tg_op), tg_table_name, nullif(rec ->> 'id', '')::uuid,
    jsonb_build_object('changed_columns', to_jsonb(changed), 'source', 'row_trigger'), '', '', '', 0);
  return coalesce(new, old);
end
$$;

create or replace function public.audit_enable_for(target regclass) returns void
language plpgsql
set search_path = public
as $$
declare
  tname text := (select relname from pg_class where oid = target);
begin
  execute format('drop trigger if exists trg_%s_audit on %s', tname, target);
  execute format('create trigger trg_%s_audit after insert or update or delete on %s for each row execute function public.audit_row_change()', tname, target);
end
$$;

do $$
declare t text;
begin
  foreach t in array array['companies', 'profiles', 'memberships', 'role_permissions', 'feature_flags']
  loop
    perform public.audit_enable_for(('public.' || t)::regclass);
  end loop;
end
$$;

-- Access: tenants read their own chain (owner only); platform roles read everything. Nobody writes except through functions.
revoke all on public.audit_logs, public.audit_checkpoints from authenticated;
grant select on public.audit_logs, public.audit_checkpoints to authenticated;
grant select, insert on public.audit_logs, public.audit_checkpoints to service_role;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select public.app_is_platform()) or (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner'));
drop policy if exists audit_checkpoints_select on public.audit_checkpoints;
create policy audit_checkpoints_select on public.audit_checkpoints for select to authenticated
  using ((select public.app_is_platform()));

revoke execute on function public.kd_audit_append(uuid, uuid, text, uuid, text, text, uuid, text, text, text, text, jsonb),
  public.kd_audit_verify(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.kd_audit_append(uuid, uuid, text, uuid, text, text, uuid, text, text, text, text, jsonb),
  public.kd_audit_verify(text, bigint, bigint) to service_role;
