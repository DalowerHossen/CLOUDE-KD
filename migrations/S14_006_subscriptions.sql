-- path: migrations/S14_006_subscriptions.sql
-- STEP 14.6 Platform subscriptions: companies pay the platform for their plan.
--   billing_settings         one platform row: who sends the invoice, bank instructions, tax by country, grace days.
--   platform_subscriptions   one live subscription per company: plan, interval, period, trial, cancel at period end,
--                            a plan change waiting for the end of the cycle, dunning state.
--   platform_invoices        the invoices the platform sends to companies (numbered per year), with tax and a receipt.
--   platform_invoice_items   the lines of an invoice.
--   platform_invoice_counters  the last number used per year.
--   subscription_events      the history of each subscription (append only).

create table if not exists public.billing_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  seller_name text not null default '' check (char_length(seller_name) <= 200),
  seller_address text not null default '' check (char_length(seller_address) <= 500),
  seller_tax_id text not null default '' check (char_length(seller_tax_id) <= 60),
  bank_instructions text not null default '' check (char_length(bank_instructions) <= 1000),
  default_tax_percent numeric(18,4) not null default 0 check (default_tax_percent between 0 and 100),
  tax_percent_by_country jsonb not null default '{}'::jsonb check (jsonb_typeof(tax_percent_by_country) = 'object'),
  grace_days integer check (grace_days is null or grace_days between 0 and 60),
  operator_company_id uuid references public.companies (id) on delete restrict,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.platform_subscriptions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  plan_slug text not null check (public.is_snake_token(plan_slug)),
  interval text not null default 'month' check (interval in ('month', 'year')),
  status text not null default 'active' check (status in ('incomplete', 'trialing', 'active', 'past_due', 'grace', 'ended')),
  seats integer not null default 1 check (seats between 1 and 10000),
  trial_ends_at timestamptz,
  trial_used boolean not null default false,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  cancelled_at timestamptz,
  pending_plan_slug text check (pending_plan_slug is null or public.is_snake_token(pending_plan_slug)),
  pending_interval text check (pending_interval is null or pending_interval in ('month', 'year')),
  pending_kind text check (pending_kind is null or pending_kind in ('on_payment', 'period_end')),
  dunning_attempts integer not null default 0 check (dunning_attempts between 0 and 10),
  next_dunning_at timestamptz,
  grace_ends_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (current_period_end > current_period_start),
  check ((status = 'ended') = (ended_at is not null)),
  check (pending_kind is not null or (pending_plan_slug is null and pending_interval is null))
);

create table if not exists public.platform_invoices (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  subscription_id uuid references public.platform_subscriptions (id) on delete restrict,
  number text not null check (number ~ '^PI-\d{4}-\d{6}$'),
  kind text not null default 'subscription' check (kind in ('subscription', 'upgrade', 'overage', 'seats')),
  status text not null default 'open' check (status in ('open', 'paid', 'void', 'uncollectible')),
  currency text not null default 'USD' check (currency = 'USD'),
  description text not null default '' check (char_length(description) <= 300),
  subtotal numeric(18,4) not null check (subtotal >= 0),
  tax_percent numeric(18,4) not null default 0 check (tax_percent between 0 and 100),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  total numeric(18,4) not null check (total >= 0),
  credit_applied numeric(18,4) not null default 0 check (credit_applied >= 0),
  buyer_name text not null default '' check (char_length(buyer_name) <= 200),
  buyer_country char(2) check (buyer_country is null or buyer_country ~ '^[A-Z]{2}$'),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  payment_method text check (payment_method is null or char_length(payment_method) <= 40),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 120),
  operator_invoice_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (total = subtotal + tax_amount),
  check ((status = 'paid') = (paid_at is not null))
);

create table if not exists public.platform_invoice_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.platform_invoices (id) on delete restrict,
  position integer not null check (position between 1 and 50),
  description text not null check (char_length(description) between 1 and 300),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  unit_amount numeric(18,4) not null,
  amount numeric(18,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.platform_invoice_counters (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  year integer not null check (year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.subscription_events (
  -- guard:append-only (the history of a subscription; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  subscription_id uuid not null references public.platform_subscriptions (id) on delete restrict,
  event text not null check (char_length(event) between 1 and 60),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.billing_settings');
select public.apply_standard_triggers('public.platform_subscriptions');
select public.apply_standard_triggers('public.platform_invoices');
select public.apply_standard_triggers('public.platform_invoice_items');
select public.apply_standard_triggers('public.platform_invoice_counters');
select public.rls_enable_default_deny('public.billing_settings');
select public.rls_enable_default_deny('public.platform_subscriptions');
select public.rls_enable_default_deny('public.platform_invoices');
select public.rls_enable_default_deny('public.platform_invoice_items');
select public.rls_enable_default_deny('public.platform_invoice_counters');
select public.rls_enable_default_deny('public.subscription_events');
select public.audit_enable_for('public.billing_settings');
select public.audit_enable_for('public.platform_subscriptions');
select public.audit_enable_for('public.platform_invoices');

drop trigger if exists trg_subscription_events_append on public.subscription_events;
create trigger trg_subscription_events_append before update or delete on public.subscription_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_billing_settings on public.billing_settings ((true)) where deleted_at is null;
create unique index if not exists uq_platform_subscriptions_company on public.platform_subscriptions (company_id) where deleted_at is null;
create index if not exists ix_platform_subscriptions_status on public.platform_subscriptions (status, current_period_end) where deleted_at is null;
create index if not exists ix_platform_subscriptions_dunning on public.platform_subscriptions (next_dunning_at) where next_dunning_at is not null and deleted_at is null;
create unique index if not exists uq_platform_invoices_number on public.platform_invoices (number) where deleted_at is null;
create unique index if not exists uq_platform_invoices_key on public.platform_invoices (company_id, idempotency_key);
create index if not exists ix_platform_invoices_company on public.platform_invoices (company_id, issued_at desc) where deleted_at is null;
create index if not exists ix_platform_invoices_open on public.platform_invoices (due_at) where status = 'open' and deleted_at is null;
create index if not exists ix_platform_invoices_operator on public.platform_invoices (operator_invoice_id) where operator_invoice_id is not null;
create unique index if not exists uq_platform_invoice_items on public.platform_invoice_items (invoice_id, position) where deleted_at is null;
create unique index if not exists uq_platform_invoice_counters on public.platform_invoice_counters (year) where deleted_at is null;
create index if not exists ix_subscription_events on public.subscription_events (subscription_id, created_at desc);

-- The next invoice number of a year, in one step (two requests at once never get the same number).
create or replace function public.kd_platform_invoice_number(p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last integer;
begin
  insert into public.platform_invoice_counters (year, last_number) values (p_year, 1)
    on conflict (year) where deleted_at is null do update set last_number = public.platform_invoice_counters.last_number + 1
    returning last_number into v_last;
  return 'PI-' || lpad(p_year::text, 4, '0') || '-' || lpad(v_last::text, 6, '0');
end
$$;

revoke execute on function public.kd_platform_invoice_number(integer) from public, anon, authenticated;
grant execute on function public.kd_platform_invoice_number(integer) to service_role;
grant all on public.billing_settings, public.platform_subscriptions, public.platform_invoices, public.platform_invoice_items,
  public.platform_invoice_counters, public.subscription_events to service_role;
