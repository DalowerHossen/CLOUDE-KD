-- path: migrations/S16_028_checkout_sessions.sql
-- STEP 16 Hosted checkout sessions (white-label checkout API). A merchant's store (WooCommerce, Shopify or its own code) asks the
-- platform for a session for one order and sends the buyer to the returned address. One order reference makes one session: asking
-- again returns the same session, and an order that is paid cannot be paid again. The buyer never has an account.
-- The session holds no card data and no processor name; the invoice and the payment link hold the money side.

create table if not exists public.checkout_sessions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  api_key_id uuid,
  external_ref text not null check (char_length(external_ref) between 1 and 100 and external_ref !~ '[[:cntrl:]<>]'),
  invoice_id uuid,
  payment_link_id uuid,
  -- The address of the hosted page holds a secret token, so it is kept sealed (purpose pii, scope the company).
  checkout_url_enc jsonb check (checkout_url_enc is null or jsonb_typeof(checkout_url_enc) = 'object'),
  amount numeric(18,4) not null check (amount > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  customer_name text not null check (char_length(customer_name) between 1 and 200),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  description text not null default '' check (char_length(description) <= 500),
  success_url text not null check (success_url ~ '^https://' and char_length(success_url) <= 500),
  cancel_url text not null check (cancel_url ~ '^https://' and char_length(cancel_url) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096),
  status text not null default 'open' check (status in ('creating', 'open', 'paid', 'cancelled', 'expired')),
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  -- A row that is still being made (the order claim) has no invoice yet; every other state has all of them.
  check (status = 'creating' or (invoice_id is not null and payment_link_id is not null and checkout_url_enc is not null and expires_at is not null))
);

-- A claim that never finished (a crash) is taken over by the next request after two minutes (see services/checkout/sessions.ts).
-- One session per order of a company, for ever: a second request for the same order returns this session.
create unique index if not exists uq_checkout_sessions_order on public.checkout_sessions (company_id, external_ref);
create unique index if not exists uq_checkout_sessions_invoice on public.checkout_sessions (invoice_id);
create index if not exists ix_checkout_sessions_company on public.checkout_sessions (company_id, created_at desc);

select public.apply_standard_triggers('public.checkout_sessions');
select public.rls_enable_default_deny('public.checkout_sessions');
select public.audit_enable_for('public.checkout_sessions');
