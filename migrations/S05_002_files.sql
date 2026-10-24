-- path: migrations/S05_002_files.sql
-- STEP 05.2b File records, quarantine, resumable upload sessions, quotas and the known-malware hash list.

create table if not exists public.files (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  category text not null check (category in ('invoice', 'receipt', 'contract', 'kyc', 'logo', 'attachment', 'payslip', 'evidence', 'export', 'cms', 'other')),
  name text not null check (char_length(name) between 1 and 160),
  mime_type text not null check (char_length(mime_type) between 3 and 120),
  size_bytes bigint not null check (size_bytes > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_provider text not null check (storage_provider in ('google_drive', 'supabase')),
  storage_ref text not null check (char_length(storage_ref) between 1 and 400),
  key_version integer not null check (key_version between 1 and 3),
  enc_iv text not null check (char_length(enc_iv) between 12 and 40),
  enc_tag text not null check (char_length(enc_tag) between 20 and 40),
  scan_status text not null default 'skipped' check (scan_status in ('clean', 'skipped', 'pending', 'error')),
  uploaded_by uuid,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.file_quarantine (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  uploaded_by uuid,
  category text not null,
  name text not null check (char_length(name) <= 160),
  declared_mime text check (declared_mime is null or char_length(declared_mime) <= 120),
  size_bytes bigint not null check (size_bytes >= 0),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  reason_code text not null check (char_length(reason_code) <= 40),
  reason text not null check (char_length(reason) <= 300),
  status text not null default 'held' check (status in ('held', 'dismissed', 'confirmed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.malware_hashes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(label) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.upload_sessions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  category text not null,
  name text not null check (char_length(name) between 1 and 200),
  declared_mime text check (declared_mime is null or char_length(declared_mime) <= 120),
  file_bytes bigint not null check (file_bytes > 0 and file_bytes <= 10485760),
  chunk_bytes integer not null check (chunk_bytes between 65536 and 4194304),
  chunk_count integer not null check (chunk_count between 1 and 160),
  expected_hash text check (expected_hash is null or expected_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'completing', 'complete', 'aborted')),
  file_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

-- Transient data: chunks are deleted for real when a session ends, so this table has no soft-delete trigger.
create table if not exists public.upload_chunks (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  session_id uuid not null references public.upload_sessions (id) on delete restrict,
  idx integer not null check (idx >= 0),
  data bytea not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.upload_usage (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  month date not null,
  bytes bigint not null default 0 check (bytes >= 0),
  files integer not null default 0 check (files >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.files');
select public.apply_standard_triggers('public.file_quarantine');
select public.apply_standard_triggers('public.malware_hashes');
select public.apply_standard_triggers('public.upload_sessions');
select public.apply_standard_triggers('public.upload_usage');
select public.rls_enable_default_deny('public.files');
select public.rls_enable_default_deny('public.file_quarantine');
select public.rls_enable_default_deny('public.malware_hashes');
select public.rls_enable_default_deny('public.upload_sessions');
select public.rls_enable_default_deny('public.upload_chunks');
select public.rls_enable_default_deny('public.upload_usage');
select public.audit_enable_for('public.files');
select public.audit_enable_for('public.malware_hashes');

-- A company stores one live record per category and content; platform files (no company) share one slot.
create unique index if not exists uq_files_content on public.files (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), category, content_hash) where deleted_at is null;
create unique index if not exists uq_files_ref on public.files (storage_provider, storage_ref) where deleted_at is null;
create index if not exists ix_files_company on public.files (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_files_retention on public.files (retention_until) where deleted_at is null and retention_until is not null;
create unique index if not exists uq_upload_chunk on public.upload_chunks (session_id, idx);
create unique index if not exists uq_upload_usage on public.upload_usage (company_id, month);
create unique index if not exists uq_malware_hash on public.malware_hashes (content_hash) where deleted_at is null;
create index if not exists ix_quarantine_status on public.file_quarantine (status, created_at desc) where deleted_at is null;
create index if not exists ix_upload_sessions_expiry on public.upload_sessions (expires_at) where deleted_at is null;

revoke all on public.files, public.file_quarantine, public.malware_hashes, public.upload_sessions, public.upload_chunks, public.upload_usage from authenticated;
grant all on public.files, public.file_quarantine, public.malware_hashes, public.upload_sessions, public.upload_chunks, public.upload_usage to service_role;

-- Stores one chunk (idempotent: a repeated chunk replaces the earlier one) and returns how many chunks the session has.
create or replace function public.kd_upload_chunk_put(p_session uuid, p_idx integer, p_data bytea) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.upload_sessions%rowtype;
  n integer;
begin
  select * into s from public.upload_sessions where id = p_session and deleted_at is null and status = 'open' and expires_at > now() for update;
  if not found then raise exception 'upload session not open' using errcode = 'P0002'; end if;
  if p_idx < 0 or p_idx >= s.chunk_count then raise exception 'chunk index out of range' using errcode = '22023'; end if;
  if octet_length(p_data) > s.chunk_bytes or (p_idx < s.chunk_count - 1 and octet_length(p_data) <> s.chunk_bytes) then
    raise exception 'chunk size mismatch' using errcode = '22023';
  end if;
  insert into public.upload_chunks (company_id, session_id, idx, data, size_bytes) values (s.company_id, p_session, p_idx, p_data, octet_length(p_data))
  on conflict (session_id, idx) do update set data = excluded.data, size_bytes = excluded.size_bytes, created_at = now();
  select count(*) into n from public.upload_chunks where session_id = p_session;
  return n;
end
$$;

-- Marks the session as completing (only once) so two requests cannot assemble the same file.
create or replace function public.kd_upload_begin_complete(p_session uuid, p_user uuid) returns public.upload_sessions
language plpgsql security definer
set search_path = public
as $$
declare
  s public.upload_sessions%rowtype;
  n integer;
  total bigint;
begin
  select * into s from public.upload_sessions where id = p_session and user_id = p_user and deleted_at is null and status = 'open' and expires_at > now() for update;
  if not found then raise exception 'upload session not open' using errcode = 'P0002'; end if;
  select count(*), coalesce(sum(size_bytes), 0) into n, total from public.upload_chunks where session_id = p_session;
  if n <> s.chunk_count or total <> s.file_bytes then raise exception 'chunks missing' using errcode = '22023'; end if;
  update public.upload_sessions set status = 'completing', updated_at = now() where id = p_session returning * into s;
  return s;
end
$$;

-- Adds to the monthly usage of a company and refuses when the month would pass the limit.
create or replace function public.kd_upload_usage_add(p_company uuid, p_bytes bigint, p_monthly_limit bigint) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', now())::date;
  u public.upload_usage%rowtype;
begin
  insert into public.upload_usage (company_id, month) values (p_company, m) on conflict (company_id, month) do nothing;
  select * into u from public.upload_usage where company_id = p_company and month = m for update;
  if u.bytes + p_bytes > p_monthly_limit then
    return jsonb_build_object('allowed', false, 'bytes', u.bytes, 'files', u.files);
  end if;
  update public.upload_usage set bytes = bytes + p_bytes, files = files + 1, updated_at = now() where company_id = p_company and month = m returning * into u;
  return jsonb_build_object('allowed', true, 'bytes', u.bytes, 'files', u.files);
end
$$;

create or replace function public.kd_company_storage_bytes(p_company uuid) returns bigint
language sql stable security definer
set search_path = public
as $$ select coalesce(sum(size_bytes), 0)::bigint from public.files where company_id = p_company and deleted_at is null $$;

create or replace function public.kd_known_malware(p_hash text) returns boolean
language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.malware_hashes where content_hash = p_hash and deleted_at is null) $$;

create or replace function public.kd_upload_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.upload_sessions set status = 'aborted', deleted_at = now() where deleted_at is null and status in ('open', 'completing') and expires_at < now();
  delete from public.upload_chunks c using public.upload_sessions s where s.id = c.session_id and (s.deleted_at is not null or s.status in ('complete', 'aborted'));
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_upload_chunk_put(uuid, integer, bytea), public.kd_upload_begin_complete(uuid, uuid),
  public.kd_upload_usage_add(uuid, bigint, bigint), public.kd_company_storage_bytes(uuid), public.kd_known_malware(text),
  public.kd_upload_purge() from public, anon, authenticated;
grant execute on function public.kd_upload_chunk_put(uuid, integer, bytea), public.kd_upload_begin_complete(uuid, uuid),
  public.kd_upload_usage_add(uuid, bigint, bigint), public.kd_company_storage_bytes(uuid), public.kd_known_malware(text),
  public.kd_upload_purge() to service_role;
