-- path: migrations/S16_022_settlement_ingest.sql
-- STEP 16.15.a Keys with which the main merchant's app posts settlement entries by itself. Only the hash of a key is kept.

create table if not exists public.settlement_ingest_keys (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
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

select public.apply_standard_triggers('public.settlement_ingest_keys');
select public.rls_enable_default_deny('public.settlement_ingest_keys');
select public.audit_enable_for('public.settlement_ingest_keys');

create unique index if not exists uq_settlement_ingest_hash on public.settlement_ingest_keys (key_hash);
create index if not exists ix_settlement_ingest_company on public.settlement_ingest_keys (company_id, created_at desc) where deleted_at is null;

-- The secret and the company of a key do not change; a revoked key stays revoked.
create or replace function public.kd_settlement_ingest_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.key_hash is distinct from old.key_hash then
      raise exception 'the owner and the secret of a key do not change' using errcode = '55000';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'a revoked key stays revoked' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_settlement_ingest_guard on public.settlement_ingest_keys;
create trigger trg_settlement_ingest_guard before update on public.settlement_ingest_keys for each row execute function public.kd_settlement_ingest_guard();

revoke all on public.settlement_ingest_keys from authenticated;
grant all on public.settlement_ingest_keys to service_role;
revoke all on function public.kd_settlement_ingest_guard() from public, anon, authenticated;
grant execute on function public.kd_settlement_ingest_guard() to service_role;
