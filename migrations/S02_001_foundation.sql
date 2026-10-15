-- path: migrations/S02_001_foundation.sql
-- STEP 02.1 Migration foundation: extensions and shared helper functions. Safe to run twice.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- pg_cron exists on Supabase; plain PostgreSQL used for local checks may not ship it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end
$$;

-- UUID v7: 48-bit unix millisecond timestamp, version 7, RFC 4122 variant, 74 random bits.
create or replace function public.uuid_generate_v7() returns uuid
language plpgsql volatile parallel safe
set search_path = public, extensions
as $$
declare
  ts_ms bigint;
  rnd bytea;
  raw bytea;
begin
  ts_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  rnd := extensions.gen_random_bytes(10);
  raw := decode(lpad(to_hex(ts_ms), 12, '0'), 'hex') || rnd;
  raw := set_byte(raw, 6, (get_byte(raw, 6) & 15) | 112);
  raw := set_byte(raw, 8, (get_byte(raw, 8) & 63) | 128);
  return encode(raw, 'hex')::uuid;
end
$$;

-- Trigger: keep updated_at current.
create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Trigger: optimistic locking. Every UPDATE must carry the version that the caller read.
-- The new row version must equal old.version + 1 (set by the caller) or be left untouched (then it is bumped).
create or replace function public.bump_version() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.version is distinct from old.version and new.version <> old.version + 1 then
    raise exception 'version conflict on %.%: expected %, got %', tg_table_schema, tg_table_name, old.version + 1, new.version
      using errcode = '40001';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

-- Trigger: soft delete only. DELETE becomes an update of deleted_at; hard delete needs the retention job role.
create or replace function public.soft_delete_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('kd.allow_hard_delete', true) = 'on' then
    return old;
  end if;
  execute format('update %I.%I set deleted_at = now() where id = $1 and deleted_at is null', tg_table_schema, tg_table_name)
    using old.id;
  return null;
end
$$;

-- Helper: attach the standard triggers to a table (updated_at, version, soft delete).
create or replace function public.apply_standard_triggers(target regclass) returns void
language plpgsql
set search_path = public
as $$
declare
  tname text := (select relname from pg_class where oid = target);
begin
  execute format('drop trigger if exists trg_%s_updated_at on %s', tname, target);
  execute format('create trigger trg_%s_updated_at before update on %s for each row execute function public.set_updated_at()', tname, target);
  execute format('drop trigger if exists trg_%s_version on %s', tname, target);
  execute format('create trigger trg_%s_version before update on %s for each row execute function public.bump_version()', tname, target);
  execute format('drop trigger if exists trg_%s_soft_delete on %s', tname, target);
  execute format('create trigger trg_%s_soft_delete before delete on %s for each row execute function public.soft_delete_guard()', tname, target);
end
$$;

-- Helper: enable RLS, force it for table owners and remove default grants. With no policy the table is default-deny.
create or replace function public.rls_enable_default_deny(target regclass) returns void
language plpgsql
set search_path = public
as $$
begin
  execute format('alter table %s enable row level security', target);
  execute format('alter table %s force row level security', target);
  execute format('revoke all on %s from anon', target);
end
$$;

-- Helper: unique index that ignores soft-deleted rows. Usage: select public.create_live_unique_index('companies', 'slug');
create or replace function public.create_live_unique_index(target regclass, columns text) returns void
language plpgsql
set search_path = public
as $$
declare
  tname text := (select relname from pg_class where oid = target);
  iname text := format('uq_%s_%s_live', tname, regexp_replace(columns, '[^a-z0-9]+', '_', 'g'));
begin
  execute format('create unique index if not exists %I on %s (%s) where deleted_at is null', iname, target, columns);
end
$$;

-- Platform enum conventions: text columns with CHECK constraints (no native enums, so adding a value is a plain migration).
-- Helper that returns true when a text value is a lowercase snake_case token.
create or replace function public.is_snake_token(value text) returns boolean
language sql immutable parallel safe
as $$ select value ~ '^[a-z][a-z0-9_]*$' $$;
