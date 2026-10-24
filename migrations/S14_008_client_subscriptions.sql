-- path: migrations/S14_008_client_subscriptions.sql
-- STEP 14.8 Client subscriptions: a company sells a recurring plan to its own clients.
--   client_subscription_plans   the plans a company defines (price, interval, features, trial, seats).
--   client_subscriptions        a client on a plan: period, trial, pause, cancel at the end of the cycle, a plan change
--                               waiting for the end of the cycle, and the state of an unpaid invoice. The price, seat
--                               price and included seats are copied from the plan when the client joins, so a later
--                               change of the plan does not change what an existing client pays.
--   client_billing_runs         one row per billing cycle (and per upgrade) of a subscription. The unique key makes a cycle
--                               billable once, even when two jobs run at the same time.
--   client_subscription_events  the history of each client subscription (append only).

create table if not exists public.client_subscription_plans (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  price numeric(18,4) not null check (price > 0),
  interval text not null default 'month' check (interval in ('month', 'year')),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array' and jsonb_array_length(features) <= 20),
  seat_price numeric(18,4) not null default 0 check (seat_price >= 0),
  included_seats integer not null default 1 check (included_seats between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.client_subscriptions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  plan_id uuid not null references public.client_subscription_plans (id) on delete restrict,
  status text not null default 'active' check (status in ('trialing', 'active', 'paused', 'past_due', 'cancelled', 'ended')),
  interval text not null check (interval in ('month', 'year')),
  price numeric(18,4) not null check (price > 0),
  seat_price numeric(18,4) not null default 0 check (seat_price >= 0),
  included_seats integer not null default 1 check (included_seats >= 1),
  seats integer not null default 1 check (seats between 1 and 10000),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  next_billing_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  paused_at timestamptz,
  pause_resumes_at timestamptz,
  pending_plan_id uuid references public.client_subscription_plans (id) on delete restrict,
  pending_seats integer check (pending_seats is null or pending_seats between 1 and 10000),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10),
  next_attempt_at timestamptz,
  grace_ends_at timestamptz,
  created_by uuid,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (current_period_end > current_period_start),
  check ((status in ('cancelled', 'ended')) = (ended_at is not null)),
  check ((status = 'paused') = (paused_at is not null))
);

create table if not exists public.client_billing_runs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  subscription_id uuid not null references public.client_subscriptions (id) on delete restrict,
  kind text not null default 'cycle' check (kind in ('cycle', 'upgrade')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  invoice_id uuid references public.invoices (id) on delete restrict,
  status text not null default 'claimed' check (status in ('claimed', 'invoiced', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (period_end > period_start),
  check (status <> 'invoiced' or invoice_id is not null)
);

create table if not exists public.client_subscription_events (
  -- guard:append-only (the history of a client subscription; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  subscription_id uuid not null references public.client_subscriptions (id) on delete restrict,
  event text not null check (char_length(event) between 1 and 60),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.client_subscription_plans');
select public.apply_standard_triggers('public.client_subscriptions');
select public.apply_standard_triggers('public.client_billing_runs');
select public.rls_enable_default_deny('public.client_subscription_plans');
select public.rls_enable_default_deny('public.client_subscriptions');
select public.rls_enable_default_deny('public.client_billing_runs');
select public.rls_enable_default_deny('public.client_subscription_events');
select public.audit_enable_for('public.client_subscription_plans');
select public.audit_enable_for('public.client_subscriptions');

drop trigger if exists trg_client_subscription_events_append on public.client_subscription_events;
create trigger trg_client_subscription_events_append before update or delete on public.client_subscription_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_client_subscription_plans_name on public.client_subscription_plans (company_id, lower(name)) where deleted_at is null and status = 'active';
create index if not exists ix_client_subscription_plans_company on public.client_subscription_plans (company_id) where deleted_at is null;
create unique index if not exists uq_client_subscriptions_live on public.client_subscriptions (client_id, plan_id) where deleted_at is null and status not in ('cancelled', 'ended');
create index if not exists ix_client_subscriptions_company on public.client_subscriptions (company_id, status) where deleted_at is null;
create index if not exists ix_client_subscriptions_billing on public.client_subscriptions (next_billing_at) where status in ('trialing', 'active') and deleted_at is null;
create index if not exists ix_client_subscriptions_attempt on public.client_subscriptions (next_attempt_at) where status in ('past_due') and deleted_at is null;
create unique index if not exists uq_client_billing_runs on public.client_billing_runs (subscription_id, kind, period_start) where deleted_at is null;
create index if not exists ix_client_billing_runs_invoice on public.client_billing_runs (invoice_id) where invoice_id is not null;
create index if not exists ix_client_subscription_events on public.client_subscription_events (subscription_id, created_at desc);

grant all on public.client_subscription_plans, public.client_subscriptions, public.client_billing_runs, public.client_subscription_events to service_role;
