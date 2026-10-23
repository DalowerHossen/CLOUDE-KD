-- path: migrations/S14_003_payouts.sql
-- STEP 14.3.a Payouts.
--   payout_methods    where a company is paid (details are encrypted; only a short hint is readable).
--   payout_schedules  an optional automatic payout per company (daily, weekly or monthly).
--   payout_settings   the minimum, the period limit, the fee, the large-payout threshold: one platform row
--                     (company_id null) and optional per-company rows; a null column means "use the platform value".
--   payouts           one row per payout request; the money moves through the wallet ledger (payout_in_transit).
--   payout_events     the status history of each payout (append only).

create table if not exists public.payout_methods (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  partner text not null default 'manual' check (partner ~ '^[a-z][a-z0-9_]{1,40}$'),
  kind text not null check (kind in ('bank_transfer', 'wire', 'partner_payout')),
  label text not null check (char_length(label) between 1 and 80),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  hint text not null default '' check (char_length(hint) <= 40),
  details_encrypted jsonb not null check (jsonb_typeof(details_encrypted) = 'object'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  is_default boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.payout_schedules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  method_id uuid not null references public.payout_methods (id) on delete restrict,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday integer check (weekday is null or weekday between 0 and 6),
  month_day integer check (month_day is null or month_day between 1 and 28),
  keep_amount numeric(18,4) not null default 0 check (keep_amount >= 0),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((frequency = 'weekly') = (weekday is not null)),
  check ((frequency = 'monthly') = (month_day is not null))
);

create table if not exists public.payout_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  min_amount numeric(18,4) check (min_amount is null or min_amount > 0),
  period_limit numeric(18,4) check (period_limit is null or period_limit > 0),
  period_unit text check (period_unit is null or period_unit in ('day', 'week', 'month')),
  fee_fixed numeric(18,4) check (fee_fixed is null or fee_fixed >= 0),
  fee_percent numeric(18,4) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 20)),
  fx_fee_percent numeric(18,4) check (fx_fee_percent is null or (fx_fee_percent >= 0 and fx_fee_percent <= 20)),
  large_threshold numeric(18,4) check (large_threshold is null or large_threshold > 0),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.payouts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  method_id uuid not null references public.payout_methods (id) on delete restrict,
  partner text not null check (partner ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null default 'requested' check (status in ('requested', 'pending_approval', 'approved', 'processing', 'paid', 'failed', 'cancelled', 'reversed')),
  source text not null default 'owner' check (source in ('owner', 'schedule')),
  amount numeric(18,4) not null check (amount > 0),
  fee numeric(18,4) not null default 0 check (fee >= 0),
  net numeric(18,4) not null check (net >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(20,8) check (fx_rate is null or fx_rate > 0),
  local_amount numeric(18,4) check (local_amount is null or local_amount >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  approval_request_id uuid,
  requested_by uuid,
  note text not null default '' check (char_length(note) <= 300),
  reference text check (reference is null or char_length(reference) <= 120),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  approved_at timestamptz,
  processing_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (fee <= amount),
  check (net = amount - fee),
  check ((currency = 'USD') = (fx_rate is null))
);

create table if not exists public.payout_events (
  -- guard:append-only (the status history of a payout; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payout_id uuid not null references public.payouts (id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id uuid,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.payout_methods');
select public.apply_standard_triggers('public.payout_schedules');
select public.apply_standard_triggers('public.payout_settings');
select public.apply_standard_triggers('public.payouts');
select public.rls_enable_default_deny('public.payout_methods');
select public.rls_enable_default_deny('public.payout_schedules');
select public.rls_enable_default_deny('public.payout_settings');
select public.rls_enable_default_deny('public.payouts');
select public.rls_enable_default_deny('public.payout_events');
select public.audit_enable_for('public.payout_methods');
select public.audit_enable_for('public.payout_schedules');
select public.audit_enable_for('public.payout_settings');
select public.audit_enable_for('public.payouts');

drop trigger if exists trg_payout_events_append on public.payout_events;
create trigger trg_payout_events_append before update or delete on public.payout_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_payout_methods_default on public.payout_methods (company_id) where is_default and deleted_at is null;
create index if not exists ix_payout_methods_company on public.payout_methods (company_id) where deleted_at is null;
create unique index if not exists uq_payout_schedules_company on public.payout_schedules (company_id) where deleted_at is null;
create index if not exists ix_payout_schedules_due on public.payout_schedules (next_run_at) where enabled and deleted_at is null;
create unique index if not exists uq_payout_settings_company on public.payout_settings (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;
create unique index if not exists uq_payouts_idempotency on public.payouts (company_id, idempotency_key);
create index if not exists ix_payouts_company on public.payouts (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_payouts_work on public.payouts (status, next_attempt_at) where status in ('approved', 'processing') and deleted_at is null;
create index if not exists ix_payout_events_payout on public.payout_events (payout_id, created_at);

grant all on public.payout_methods, public.payout_schedules, public.payout_settings, public.payouts, public.payout_events to service_role;
