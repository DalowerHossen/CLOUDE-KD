-- path: migrations/S15_009_tax_audit.sql
-- STEP 15.7.c Tax filing support and the audit pack.
--   tax_filing_settings  the rate used for the quarterly tax provision and the days before a deadline the owner is reminded.
--   tax_payments         a tax payment made to an authority (paid against due); the amount is booked by the owner's own entry.
--   tax_deadlines        the filing and payment calendar; the daily job reminds before the date and on the day.
--   audit_packs          one row per audit pack made: the period, the checksum of its manifest and the result of the audit chain check.

create table if not exists public.tax_filing_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  provision_rate numeric(7,4) not null default 0 check (provision_rate between 0 and 100),
  reminder_days integer not null default 7 check (reminder_days between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.tax_payments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  jurisdiction text not null check (char_length(jurisdiction) between 1 and 60),
  tax_kind text not null default 'sales' check (tax_kind in ('sales', 'vat', 'gst', 'withholding', 'income', 'payroll', 'other')),
  period_start date not null,
  period_end date not null,
  amount numeric(18,4) not null check (amount > 0),
  paid_on date not null,
  reference text not null default '' check (char_length(reference) <= 80),
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (period_end >= period_start)
);

create table if not exists public.tax_deadlines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  jurisdiction text not null default '' check (char_length(jurisdiction) <= 60),
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  reminded_stage smallint not null default 0 check (reminded_stage between 0 and 2),
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'done') = (done_at is not null))
);

create table if not exists public.audit_packs (
  -- guard:append-only (a record that a pack was made; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  period_from date not null,
  period_to date not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  chain_ok boolean not null,
  chain_checked_to text not null default '0',
  entries integer not null check (entries >= 0),
  audit_rows integer not null check (audit_rows >= 0),
  size_bytes integer not null check (size_bytes >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (period_to >= period_from)
);

select public.apply_standard_triggers('public.tax_filing_settings');
select public.apply_standard_triggers('public.tax_payments');
select public.apply_standard_triggers('public.tax_deadlines');
select public.rls_enable_default_deny('public.tax_filing_settings');
select public.rls_enable_default_deny('public.tax_payments');
select public.rls_enable_default_deny('public.tax_deadlines');
select public.rls_enable_default_deny('public.audit_packs');
select public.audit_enable_for('public.tax_filing_settings');
select public.audit_enable_for('public.tax_payments');
select public.audit_enable_for('public.tax_deadlines');
select public.audit_enable_for('public.audit_packs');

drop trigger if exists trg_audit_packs_append on public.audit_packs;
create trigger trg_audit_packs_append before update or delete on public.audit_packs for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_tax_filing_settings on public.tax_filing_settings (company_id) where deleted_at is null;
create index if not exists ix_tax_payments_company on public.tax_payments (company_id, paid_on) where deleted_at is null;
create index if not exists ix_tax_deadlines_due on public.tax_deadlines (company_id, due_on) where deleted_at is null;
create index if not exists ix_tax_deadlines_open on public.tax_deadlines (due_on) where deleted_at is null and status = 'open';
create index if not exists ix_audit_packs_company on public.audit_packs (company_id, created_at desc);

-- A deadline that is done keeps its time; reopening a deadline starts the reminders again.
create or replace function public.kd_tax_deadline_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.due_on <> old.due_on then new.reminded_stage := 0; end if;
  if tg_op = 'UPDATE' and old.status = 'done' and new.status = 'open' then new.reminded_stage := 0; end if;
  return new;
end
$$;
drop trigger if exists trg_tax_deadlines_guard on public.tax_deadlines;
create trigger trg_tax_deadlines_guard before update on public.tax_deadlines for each row execute function public.kd_tax_deadline_guard();

revoke all on public.tax_filing_settings, public.tax_payments, public.tax_deadlines, public.audit_packs from authenticated;
grant all on public.tax_filing_settings, public.tax_payments, public.tax_deadlines, public.audit_packs to service_role;
