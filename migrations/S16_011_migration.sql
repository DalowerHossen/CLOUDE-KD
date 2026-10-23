-- path: migrations/S16_011_migration.sql
-- STEP 16.10 Migration wizard: import clients, products and suppliers from another invoicing tool by file.
--   migration_jobs  one job per file: the source tool, the target list, the column mapping, the dry run report, the progress and the
--                   rollback window (24 hours after the job stops writing).
--   migration_rows  one row per file row that was handled: created (with the id of the record it made), skipped or failed; and
--                   what a rollback did to it. A rollback removes exactly the records a job created.

create table if not exists public.migration_jobs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  source text not null check (source in ('quickbooks', 'zoho', 'wave', 'freshbooks', 'xero', 'generic')),
  target text not null check (target in ('clients', 'products', 'suppliers')),
  file_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_kind text not null check (file_kind in ('csv', 'xlsx')),
  status text not null default 'uploaded' check (status in ('uploaded', 'validated', 'queued', 'running', 'committed', 'failed', 'cancelled', 'rolling_back', 'rolled_back', 'rollback_partial')),
  row_count integer not null check (row_count between 1 and 5000),
  mapping jsonb not null default '{}' check (jsonb_typeof(mapping) = 'object'),
  duplicate_mode text not null default 'skip' check (duplicate_mode in ('skip', 'create')),
  default_values jsonb not null default '{}' check (jsonb_typeof(default_values) = 'object'),
  report jsonb not null default '{}' check (jsonb_typeof(report) = 'object'),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  created_rows integer not null default 0 check (created_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  locked_until timestamptz,
  committed_at timestamptz,
  rollback_until timestamptz,
  rolled_back_at timestamptz,
  error text check (error is null or char_length(error) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (processed_rows <= row_count)
);

create table if not exists public.migration_rows (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  job_id uuid not null references public.migration_jobs (id) on delete restrict,
  row_number integer not null check (row_number between 2 and 5001),
  action text not null check (action in ('created', 'skipped', 'failed', 'rolled_back', 'rollback_blocked')),
  record_id uuid,
  message text check (message is null or char_length(message) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (action not in ('created', 'rolled_back', 'rollback_blocked') or record_id is not null)
);

select public.apply_standard_triggers('public.migration_jobs');
select public.apply_standard_triggers('public.migration_rows');
select public.rls_enable_default_deny('public.migration_jobs');
select public.rls_enable_default_deny('public.migration_rows');
select public.audit_enable_for('public.migration_jobs');

create unique index if not exists uq_migration_rows on public.migration_rows (job_id, row_number);
create index if not exists ix_migration_rows_created on public.migration_rows (job_id) where action = 'created';
create index if not exists ix_migration_jobs_company on public.migration_jobs (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_migration_jobs_work on public.migration_jobs (status, locked_until) where status in ('queued', 'running', 'rolling_back') and deleted_at is null;

create or replace function public.kd_migration_job_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'uploaded' then raise exception 'a job starts uploaded' using errcode = '55000'; end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.target is distinct from old.target
     or new.source is distinct from old.source or new.file_id is distinct from old.file_id then
    raise exception 'a job keeps its company, source, target and file' using errcode = '55000';
  end if;
  if old.status not in ('uploaded', 'validated') and (new.mapping is distinct from old.mapping or new.duplicate_mode is distinct from old.duplicate_mode or new.default_values is distinct from old.default_values) then
    raise exception 'the mapping is fixed once the job was queued' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'uploaded' then new.status in ('validated', 'cancelled')
      when 'validated' then new.status in ('queued', 'cancelled')
      when 'queued' then new.status in ('running', 'cancelled')
      when 'running' then new.status in ('committed', 'failed', 'cancelled', 'queued')
      when 'committed' then new.status = 'rolling_back'
      when 'failed' then new.status = 'rolling_back'
      when 'cancelled' then new.status = 'rolling_back'
      when 'rolling_back' then new.status in ('rolled_back', 'rollback_partial')
      when 'rollback_partial' then new.status = 'rolling_back'
      else false end;
    if not ok then raise exception 'a job cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
    if new.status = 'queued' and old.status = 'validated' and (new.report = '{}'::jsonb) then
      raise exception 'run the dry run before the import' using errcode = '55000';
    end if;
    if new.status = 'rolling_back' and old.status <> 'rollback_partial' and (old.rollback_until is null or old.rollback_until < now()) then
      raise exception 'the rollback window of 24 hours is over' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_migration_jobs_guard on public.migration_jobs;
create trigger trg_migration_jobs_guard before insert or update on public.migration_jobs for each row execute function public.kd_migration_job_guard();

create or replace function public.kd_migration_row_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_status text;
begin
  if tg_op = 'INSERT' then
    select company_id, status into v_company, v_status from public.migration_jobs where id = new.job_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the job was not found' using errcode = 'P0002'; end if;
    if v_status <> 'running' then raise exception 'rows are written only while the job runs' using errcode = '55000'; end if;
    if new.action not in ('created', 'skipped', 'failed') then raise exception 'a row starts created, skipped or failed' using errcode = '55000'; end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.job_id is distinct from old.job_id or new.row_number is distinct from old.row_number
     or new.record_id is distinct from old.record_id then
    raise exception 'a row keeps its job, number and record' using errcode = '55000';
  end if;
  if new.action is distinct from old.action then
    if not (old.action = 'created' and new.action in ('rolled_back', 'rollback_blocked'))
       and not (old.action = 'rollback_blocked' and new.action in ('rolled_back', 'rollback_blocked', 'created')) then
      raise exception 'a row cannot go from % to %', old.action, new.action using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_migration_rows_guard on public.migration_rows;
create trigger trg_migration_rows_guard before insert or update on public.migration_rows for each row execute function public.kd_migration_row_guard();

-- Takes jobs that have work (queued, running or rolling back) whose lock ran out, one worker each.
create or replace function public.kd_claim_migration_jobs(p_limit integer, p_lock_seconds integer) returns setof public.migration_jobs
language plpgsql
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id from public.migration_jobs j
    where j.status in ('queued', 'running', 'rolling_back') and j.deleted_at is null
      and (j.locked_until is null or j.locked_until < now())
    order by j.created_at
    limit greatest(p_limit, 1)
    for update of j skip locked
  )
  update public.migration_jobs j set
    status = case when j.status = 'queued' then 'running' else j.status end,
    locked_until = now() + make_interval(secs => p_lock_seconds)
  from due where j.id = due.id
  returning j.*;
end
$$;
