-- path: migrations/S15_002_posting.sql
-- STEP 15.2 Automated posting.
--   posting_log   one row per domain event and posting rule: what happened to the event (posted, skipped with a reason, or
--                 failed), the journal entry it made, and the review state for the accountant review queue. A second delivery
--                 of the same event updates the same row; the entry itself is made once per source key (15.1).

create table if not exists public.posting_log (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  event_id uuid not null,
  event_name text not null check (char_length(event_name) between 3 and 80),
  rule text not null check (rule ~ '^[a-z][a-z0-9_.]{1,60}$'),
  status text not null check (status in ('posted', 'skipped', 'failed')),
  entry_id uuid references public.journal_entries (id) on delete restrict,
  reason text not null default '' check (char_length(reason) <= 500),
  attempts integer not null default 1 check (attempts >= 1),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'posted') = (entry_id is not null)),
  check (reviewed_at is null or status = 'posted')
);

select public.apply_standard_triggers('public.posting_log');
select public.rls_enable_default_deny('public.posting_log');
select public.audit_enable_for('public.posting_log');

create unique index if not exists uq_posting_log_event on public.posting_log (company_id, event_id, rule) where deleted_at is null;
create index if not exists ix_posting_log_status on public.posting_log (company_id, status, created_at desc) where deleted_at is null;
create index if not exists ix_posting_log_review on public.posting_log (company_id, created_at desc) where deleted_at is null and status = 'posted' and reviewed_at is null;

revoke all on public.posting_log from authenticated;
grant all on public.posting_log to service_role;
