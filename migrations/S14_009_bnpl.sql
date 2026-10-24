-- path: migrations/S14_009_bnpl.sql
-- STEP 14.9 Buy now, pay later (installments for a client's invoice).
--   bnpl_settings  the rules: one platform row (company_id null) and optional company rows. The platform decides whether the
--                  service exists and its fee per term; a company switches it on and narrows the terms and the amounts.
--   bnpl_plans     an installment plan a client took for an invoice. The parts live in the installment plan of the invoice
--                  (STEP 09); this row keeps the offer that was accepted, the fee the seller pays, and the state.
--   bnpl_events    the history of each plan (append only).

create table if not exists public.bnpl_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  enabled boolean,
  terms integer[] check (terms is null or (cardinality(terms) between 1 and 6 and terms <@ array[2, 3, 4, 6, 9, 12, 18, 24])),
  min_amount numeric(18,4) check (min_amount is null or min_amount > 0),
  max_amount numeric(18,4) check (max_amount is null or max_amount > 0),
  fee_percent_by_term jsonb check (fee_percent_by_term is null or jsonb_typeof(fee_percent_by_term) = 'object'),
  min_paid_invoices integer check (min_paid_invoices is null or min_paid_invoices between 0 and 100),
  missed_limit integer check (missed_limit is null or missed_limit between 1 and 6),
  grace_days integer check (grace_days is null or grace_days between 0 and 30),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.bnpl_plans (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  partner text not null default 'in_house' check (partner ~ '^[a-z][a-z0-9_]{1,40}$'),
  terms integer not null check (terms between 2 and 24),
  principal numeric(18,4) not null check (principal > 0),
  seller_fee_percent numeric(18,4) not null default 0 check (seller_fee_percent between 0 and 100),
  seller_fee numeric(18,4) not null default 0 check (seller_fee >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'defaulted', 'cancelled')),
  missed_count integer not null default 0 check (missed_count between 0 and 24),
  consent_at timestamptz not null default now(),
  consent_text text not null default '' check (char_length(consent_text) <= 500),
  accepted_by text not null default 'owner' check (accepted_by in ('owner', 'client')),
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (seller_fee <= principal),
  check ((status = 'completed') = (completed_at is not null))
);

create table if not exists public.bnpl_events (
  -- guard:append-only (the history of an installment plan; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  plan_id uuid not null references public.bnpl_plans (id) on delete restrict,
  event text not null check (char_length(event) between 1 and 60),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.bnpl_settings');
select public.apply_standard_triggers('public.bnpl_plans');
select public.rls_enable_default_deny('public.bnpl_settings');
select public.rls_enable_default_deny('public.bnpl_plans');
select public.rls_enable_default_deny('public.bnpl_events');
select public.audit_enable_for('public.bnpl_settings');
select public.audit_enable_for('public.bnpl_plans');

drop trigger if exists trg_bnpl_events_append on public.bnpl_events;
create trigger trg_bnpl_events_append before update or delete on public.bnpl_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_bnpl_settings on public.bnpl_settings (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;
create unique index if not exists uq_bnpl_plans_invoice on public.bnpl_plans (invoice_id) where deleted_at is null and status in ('active', 'completed', 'defaulted');
create index if not exists ix_bnpl_plans_company on public.bnpl_plans (company_id, status) where deleted_at is null;
create index if not exists ix_bnpl_events on public.bnpl_events (plan_id, created_at desc);

grant all on public.bnpl_settings, public.bnpl_plans, public.bnpl_events to service_role;
