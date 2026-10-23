-- path: migrations/S16_009_ocr.sql
-- STEP 16.8 Receipt OCR (Google Cloud Vision).
--   ocr_settings   per company: on or off, the encrypted API key, the date order of its receipts, language hints, a daily limit and
--                  the consent that receipt images are sent to Google.
--   ocr_jobs       one job per receipt: queued, processing, done or failed; the fields read, a confidence per field, and whether the
--                  failure was reported to the expense service.
-- The text of a receipt is not stored; only the four fields are.

create table if not exists public.ocr_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  enabled boolean not null default false,
  api_key_enc jsonb check (api_key_enc is null or jsonb_typeof(api_key_enc) = 'object'),
  key_last4 text check (key_last4 is null or char_length(key_last4) = 4),
  date_order text not null default 'dmy' check (date_order in ('dmy', 'mdy')),
  language_hints text[] not null default '{}' check (cardinality(language_hints) <= 5),
  daily_limit integer not null default 200 check (daily_limit between 1 and 5000),
  consent_at timestamptz,
  consent_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (not enabled or (api_key_enc is not null and consent_at is not null))
);

create table if not exists public.ocr_jobs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  receipt_id uuid not null references public.receipts (id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  fields jsonb not null default '{}' check (jsonb_typeof(fields) = 'object'),
  confidence jsonb not null default '{}' check (jsonb_typeof(confidence) = 'object'),
  error text check (error is null or char_length(error) <= 300),
  failure_reported boolean not null default false,
  corrected_at timestamptz,
  corrected_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status <> 'failed' or error is not null)
);

select public.apply_standard_triggers('public.ocr_settings');
select public.apply_standard_triggers('public.ocr_jobs');
select public.rls_enable_default_deny('public.ocr_settings');
select public.rls_enable_default_deny('public.ocr_jobs');
select public.audit_enable_for('public.ocr_settings');
select public.audit_enable_for('public.ocr_jobs');

create unique index if not exists uq_ocr_settings on public.ocr_settings (company_id) where deleted_at is null;
create unique index if not exists uq_ocr_jobs_receipt on public.ocr_jobs (receipt_id) where deleted_at is null;
create index if not exists ix_ocr_jobs_due on public.ocr_jobs (next_attempt_at) where status in ('queued', 'processing') and deleted_at is null;
create index if not exists ix_ocr_jobs_company on public.ocr_jobs (company_id, created_at desc) where deleted_at is null;

-- A job belongs to the company of its receipt, starts queued, keeps its receipt, and moves only in the allowed ways.
create or replace function public.kd_ocr_job_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; ok boolean;
begin
  if tg_op = 'INSERT' then
    select company_id into v_company from public.receipts where id = new.receipt_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the receipt was not found' using errcode = 'P0002'; end if;
    if new.status <> 'queued' then raise exception 'a job starts queued' using errcode = '55000'; end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.receipt_id is distinct from old.receipt_id then
    raise exception 'a job keeps its receipt' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'queued' then new.status = 'processing'
      when 'processing' then new.status in ('done', 'failed', 'queued')
      when 'failed' then new.status = 'queued'
      when 'done' then new.status = 'queued'
      else false end;
    if not ok then raise exception 'a job cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
  end if;
  if old.failure_reported and not new.failure_reported and new.status <> 'queued' then
    raise exception 'a reported failure is not reported again' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_ocr_jobs_guard on public.ocr_jobs;
create trigger trg_ocr_jobs_guard before insert or update on public.ocr_jobs for each row execute function public.kd_ocr_job_guard();

-- Takes due jobs for one worker: queued ones that are due, and processing ones whose lock ran out (a worker died).
create or replace function public.kd_claim_ocr_jobs(p_limit integer, p_lock_seconds integer) returns setof public.ocr_jobs
language plpgsql
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id from public.ocr_jobs j
    where j.deleted_at is null
      and ((j.status = 'queued' and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.locked_until < now()))
    order by j.next_attempt_at
    limit greatest(p_limit, 1)
    for update of j skip locked
  )
  update public.ocr_jobs j set
    status = 'processing',
    attempts = j.attempts + 1,
    started_at = now(),
    locked_until = now() + make_interval(secs => p_lock_seconds)
  from due where j.id = due.id
  returning j.*;
end
$$;
