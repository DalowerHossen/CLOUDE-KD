-- path: migrations/S05_001_encryption.sql
-- STEP 05.1 Secret access log (append-only) and key rotation runs.

create table if not exists public.secret_access_log (
  -- guard:append-only (who read which secret; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  purpose text not null check (purpose in ('files', 'processor-credentials', 'oauth-tokens', 'kyc', 'pii')),
  operation text not null check (operation in ('decrypt', 'encrypt', 'rotate')),
  key_version integer not null check (key_version between 1 and 3),
  actor_user_id uuid,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.key_rotation_runs (
  id uuid primary key default public.uuid_generate_v7(),
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]*$'),
  column_name text not null check (column_name ~ '^[a-z][a-z0-9_]*$'),
  purpose text not null check (purpose in ('files', 'processor-credentials', 'oauth-tokens', 'kyc', 'pii')),
  to_version integer not null check (to_version between 2 and 3),
  rows_done integer not null default 0 check (rows_done >= 0),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text check (error is null or char_length(error) <= 300),
  company_id uuid references public.companies (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.key_rotation_runs');
select public.rls_enable_default_deny('public.secret_access_log');
select public.rls_enable_default_deny('public.key_rotation_runs');
select public.audit_enable_for('public.key_rotation_runs');

create index if not exists ix_secret_access_time on public.secret_access_log (created_at desc);
create index if not exists ix_secret_access_company on public.secret_access_log (company_id, created_at desc);

drop trigger if exists trg_secret_access_immutable on public.secret_access_log;
create trigger trg_secret_access_immutable before update or delete on public.secret_access_log
  for each row execute function public.audit_block_change();
drop trigger if exists trg_secret_access_no_truncate on public.secret_access_log;
create trigger trg_secret_access_no_truncate before truncate on public.secret_access_log
  for each statement execute function public.audit_block_change();

revoke all on public.secret_access_log, public.key_rotation_runs from authenticated;
grant all on public.secret_access_log, public.key_rotation_runs to service_role;
