-- path: migrations/S08_010_import_jobs.sql
-- STEP 08.9 Import jobs: one row per uploaded spreadsheet. The file itself is in the company's storage.

create table if not exists public.import_jobs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  target text not null check (target in ('clients', 'products', 'suppliers')),
  file_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_kind text not null check (file_kind in ('csv', 'xlsx')),
  status text not null default 'uploaded' check (status in ('uploaded', 'previewed', 'queued', 'running', 'done', 'failed', 'cancelled')),
  row_count integer not null default 0 check (row_count between 0 and 5000),
  mapping jsonb not null default '{}' check (jsonb_typeof(mapping) = 'object'),
  duplicate_mode text not null default 'skip' check (duplicate_mode in ('skip', 'overwrite', 'create')),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  created_rows integer not null default 0 check (created_rows >= 0),
  updated_rows integer not null default 0 check (updated_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array' and jsonb_array_length(errors) <= 500),
  error_message text not null default '' check (char_length(error_message) <= 500),
  created_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (processed_rows <= row_count),
  check (created_rows + updated_rows + skipped_rows + failed_rows <= processed_rows)
);

select public.apply_standard_triggers('public.import_jobs');
select public.rls_enable_default_deny('public.import_jobs');
select public.audit_enable_for('public.import_jobs');
revoke all on public.import_jobs from authenticated;
grant all on public.import_jobs to service_role;
create index if not exists ix_import_jobs_company on public.import_jobs (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_import_jobs_active on public.import_jobs (status) where status in ('queued', 'running') and deleted_at is null;
