-- path: migrations/S14_002_settlement.sql
-- STEP 14.2 Settlement and merchant-of-record engine.
--   mor_settings      rules for holding and settling payments: one platform row (company_id null) and optional per-company
--                     overrides; a null column means "use the platform value, then the built-in value".
--   settlements       the report of one settlement cycle of a company (items released in the period).
--   settlement_items  one row per captured payment: what was taken as fee, what the company receives, the hold and the
--                     reason the owner sees.

create table if not exists public.mor_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  enabled boolean,
  suspended boolean not null default false,
  suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 300),
  suspended_at timestamptz,
  hold_days integer check (hold_days is null or hold_days between 0 and 90),
  new_merchant_hold_days integer check (new_merchant_hold_days is null or new_merchant_hold_days between 0 and 90),
  new_merchant_days integer check (new_merchant_days is null or new_merchant_days between 0 and 365),
  reserve_percent numeric(7,4) check (reserve_percent is null or (reserve_percent >= 0 and reserve_percent <= 50)),
  reserve_days integer check (reserve_days is null or reserve_days between 0 and 365),
  cycle_days integer check (cycle_days is null or cycle_days in (1, 3, 7)),
  daily_limit numeric(18,4) check (daily_limit is null or daily_limit > 0),
  large_payment numeric(18,4) check (large_payment is null or large_payment > 0),
  velocity_count integer check (velocity_count is null or velocity_count between 1 and 100000),
  auto_suspend boolean,
  risk_extension_days integer check (risk_extension_days is null or risk_extension_days between 0 and 90),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (suspended = (suspended_at is not null))
);

create table if not exists public.settlements (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  cycle_days integer not null check (cycle_days in (1, 3, 7)),
  item_count integer not null default 0 check (item_count >= 0),
  gross numeric(18,4) not null default 0,
  fees numeric(18,4) not null default 0,
  refunds numeric(18,4) not null default 0,
  net numeric(18,4) not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (period_end >= period_start)
);

create table if not exists public.settlement_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete restrict,
  wallet_id uuid references public.wallets (id) on delete restrict,
  settlement_id uuid references public.settlements (id) on delete restrict,
  hold_id uuid references public.wallet_holds (id) on delete restrict,
  reserve_hold_id uuid references public.wallet_holds (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'held', 'released', 'direct', 'reversed', 'charged_back')),
  mode text not null check (mode in ('mor', 'direct', 'suspended')),
  processor_id text,
  gross numeric(18,4) not null check (gross > 0),
  fee numeric(18,4) not null default 0 check (fee >= 0),
  tax numeric(18,4) not null default 0 check (tax >= 0),
  net numeric(18,4) not null default 0 check (net >= 0),
  reserve numeric(18,4) not null default 0 check (reserve >= 0),
  refunded numeric(18,4) not null default 0 check (refunded >= 0),
  fee_returned numeric(18,4) not null default 0 check (fee_returned >= 0),
  charged_back numeric(18,4) not null default 0 check (charged_back >= 0),
  risk_score integer not null default 0 check (risk_score between 0 and 1000),
  hold_reason text not null default '' check (char_length(hold_reason) <= 300),
  release_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (refunded <= gross)
);

select public.apply_standard_triggers('public.mor_settings');
select public.apply_standard_triggers('public.settlements');
select public.apply_standard_triggers('public.settlement_items');
select public.rls_enable_default_deny('public.mor_settings');
select public.rls_enable_default_deny('public.settlements');
select public.rls_enable_default_deny('public.settlement_items');
select public.audit_enable_for('public.mor_settings');
select public.audit_enable_for('public.settlements');
select public.audit_enable_for('public.settlement_items');

create unique index if not exists uq_mor_settings_company on public.mor_settings (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;
create unique index if not exists uq_settlement_items_payment on public.settlement_items (payment_id) where deleted_at is null;
create unique index if not exists uq_settlements_period on public.settlements (company_id, period_start, period_end) where deleted_at is null;
create index if not exists ix_settlement_items_company on public.settlement_items (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_settlement_items_open on public.settlement_items (company_id, status) where deleted_at is null and settlement_id is null;
create index if not exists ix_settlement_items_hold on public.settlement_items (hold_id) where hold_id is not null;
create index if not exists ix_settlement_items_reserve_hold on public.settlement_items (reserve_hold_id) where reserve_hold_id is not null;

grant all on public.mor_settings, public.settlements, public.settlement_items to service_role;
