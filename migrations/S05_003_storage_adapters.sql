-- path: migrations/S05_003_storage_adapters.sql
-- STEP 05.3 Drive links per company, file access log (append-only), signed download grants, trash handling.

alter table public.files add column if not exists purged_at timestamptz;

create table if not exists public.drive_connections (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  google_email text check (google_email is null or char_length(google_email) <= 254),
  scope text not null default 'https://www.googleapis.com/auth/drive.file',
  refresh_token jsonb not null,
  access_token jsonb,
  access_expires_at timestamptz,
  folder_cache jsonb not null default '{}'::jsonb,
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  quota_limit_bytes bigint check (quota_limit_bytes is null or quota_limit_bytes >= 0),
  quota_used_bytes bigint check (quota_used_bytes is null or quota_used_bytes >= 0),
  connected_by uuid,
  connected_at timestamptz not null default now(),
  last_health_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.file_access_log (
  -- guard:append-only (who touched which file; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  file_id uuid not null,
  action text not null check (action in ('upload', 'download', 'signed_url', 'delete', 'restore', 'migrate', 'duplicate', 'purge')),
  actor_user_id uuid,
  ip_hash text,
  provider text check (provider is null or provider in ('google_drive', 'supabase')),
  created_at timestamptz not null default now()
);

create table if not exists public.signed_url_grants (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  file_id uuid not null references public.files (id) on delete restrict,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  session_required boolean not null default true,
  inline boolean not null default false,
  max_uses integer not null default 5 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.drive_connections');
select public.apply_standard_triggers('public.signed_url_grants');
select public.rls_enable_default_deny('public.drive_connections');
select public.rls_enable_default_deny('public.file_access_log');
select public.rls_enable_default_deny('public.signed_url_grants');
select public.audit_enable_for('public.drive_connections');

create unique index if not exists uq_drive_company on public.drive_connections (company_id) where deleted_at is null;
create unique index if not exists uq_grant_hash on public.signed_url_grants (token_hash);
create index if not exists ix_grant_expiry on public.signed_url_grants (expires_at) where deleted_at is null;
create index if not exists ix_file_access_file on public.file_access_log (file_id, created_at desc);
create index if not exists ix_file_access_company on public.file_access_log (company_id, created_at desc);

drop trigger if exists trg_file_access_immutable on public.file_access_log;
create trigger trg_file_access_immutable before update or delete on public.file_access_log
  for each row execute function public.audit_block_change();
drop trigger if exists trg_file_access_no_truncate on public.file_access_log;
create trigger trg_file_access_no_truncate before truncate on public.file_access_log
  for each statement execute function public.audit_block_change();

revoke all on public.drive_connections, public.file_access_log, public.signed_url_grants from authenticated;
grant all on public.drive_connections, public.file_access_log, public.signed_url_grants to service_role;

-- Uses one download of a grant. Returns nothing for an unknown, expired, used-up or deleted grant.
create or replace function public.kd_grant_redeem(p_hash text) returns table (file_id uuid, company_id uuid, session_required boolean, inline boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  g public.signed_url_grants%rowtype;
begin
  select * into g from public.signed_url_grants where token_hash = p_hash and deleted_at is null for update;
  if not found or g.expires_at <= now() or g.uses >= g.max_uses then return; end if;
  if not exists (select 1 from public.files f where f.id = g.file_id and f.deleted_at is null) then return; end if;
  update public.signed_url_grants set uses = uses + 1 where id = g.id;
  return query select g.file_id, g.company_id, g.session_required, g.inline;
end
$$;

create or replace function public.kd_grant_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.signed_url_grants set deleted_at = now() where deleted_at is null and expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_grant_redeem(text), public.kd_grant_purge() from public, anon, authenticated;
grant execute on function public.kd_grant_redeem(text), public.kd_grant_purge() to service_role;
