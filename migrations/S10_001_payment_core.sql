-- path: migrations/S10_001_payment_core.sql
-- STEP 10.1 Payment core schema.
-- Platform level (company_id is null): processors, processor_credentials, processor_modes, processor_mode_tests,
--   routing_rules, card_identities, card_blacklist, webhook_events (until the company is known).
-- Tenant level: payments, payment_attempts, payment_allocations, refunds, payment_links, payment_reviews.
-- Credentials are stored only as AES-256-GCM ciphertext (ciphertext, iv, tag, key_version); no plaintext column exists.
-- Money is numeric(18,4), always USD. Payment status changes are checked by a trigger (legal transitions only).

create table if not exists public.processors (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id in ('stripe','nmi','adyen','verifone','braintree','bluesnap','square','payoneer','fastspring','paddle','payproglobal','paypal','payarc','rapyd','authorizenet','custom')),
  enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'live')),
  active_mode text not null default 'default' check (char_length(active_mode) between 1 and 40),
  credentials_version integer not null default 0 check (credentials_version >= 0),
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 200),
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_version integer,
  last_test_mode text,
  last_test_environment text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (not enabled or credentials_version > 0)
);
create unique index if not exists uq_processors_processor on public.processors (processor_id) where deleted_at is null;

create table if not exists public.processor_credentials (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null check (char_length(processor_id) between 2 and 40),
  credentials_version integer not null check (credentials_version >= 1),
  ciphertext text not null check (char_length(ciphertext) between 1 and 20000),
  iv text not null check (char_length(iv) between 8 and 64),
  tag text not null check (char_length(tag) between 8 and 64),
  key_version integer not null check (key_version >= 1),
  field_keys text[] not null default '{}',
  last_chars jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_processor_credentials_version on public.processor_credentials (processor_id, credentials_version);
create unique index if not exists uq_processor_credentials_current on public.processor_credentials (processor_id) where is_current and deleted_at is null;

create table if not exists public.processor_modes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null,
  mode_id text not null check (mode_id ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 80),
  is_active boolean not null default false,
  switched_by uuid,
  switched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_processor_modes_mode on public.processor_modes (processor_id, mode_id) where deleted_at is null;
create unique index if not exists uq_processor_modes_active on public.processor_modes (processor_id) where is_active and deleted_at is null;

create table if not exists public.processor_mode_tests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null,
  mode_id text not null,
  environment text not null check (environment in ('sandbox', 'live')),
  credentials_version integer not null check (credentials_version >= 0),
  ok boolean not null,
  message text not null default '' check (char_length(message) <= 300),
  tested_by uuid,
  tested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create index if not exists idx_processor_mode_tests_lookup on public.processor_mode_tests (processor_id, mode_id, environment, credentials_version, tested_at desc);

create table if not exists public.routing_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  priority integer not null default 100 check (priority between 1 and 100000),
  processor_id text not null,
  min_amount numeric(18,4) check (min_amount is null or min_amount >= 0),
  max_amount numeric(18,4) check (max_amount is null or max_amount > 0),
  countries text[] not null default '{}',
  methods text[] not null default '{}',
  plans text[] not null default '{}',
  enabled boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (min_amount is null or max_amount is null or min_amount <= max_amount),
  check (cardinality(countries) <= 250 and cardinality(methods) <= 20 and cardinality(plans) <= 20)
);
create index if not exists idx_routing_rules_order on public.routing_rules (priority, created_at) where deleted_at is null;

create table if not exists public.card_identities (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null,
  identity_type text not null check (identity_type in ('fingerprint', 'token')),
  identity_hmac text not null check (identity_hmac ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_card_identities_hmac on public.card_identities (processor_id, identity_hmac);

create table if not exists public.card_blacklist (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null,
  identity_hmac text not null check (identity_hmac ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) between 1 and 300),
  source text not null default 'manual' check (source in ('manual', 'processor_fraud_signal', 'review')),
  added_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_card_blacklist_hmac on public.card_blacklist (processor_id, identity_hmac) where deleted_at is null;

create table if not exists public.payments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  processor_id text,
  mode_id text,
  environment text check (environment is null or environment in ('sandbox', 'live')),
  status text not null default 'created' check (status in ('created','requires_action','authorized','captured','failed','pending_review','voided','partially_refunded','refunded')),
  amount numeric(18,4) not null check (amount > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  captured_amount numeric(18,4) not null default 0 check (captured_amount >= 0),
  refunded_amount numeric(18,4) not null default 0 check (refunded_amount >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  processor_transaction_id text check (processor_transaction_id is null or char_length(processor_transaction_id) <= 200),
  payment_method text not null default 'card' check (char_length(payment_method) between 1 and 40),
  card_identity_id uuid references public.card_identities (id) on delete restrict,
  payer_ip text check (payer_ip is null or char_length(payer_ip) <= 64),
  payer_country text check (payer_country is null or payer_country ~ '^[A-Z]{2}$'),
  billing_postal_code_given boolean,
  three_ds jsonb not null default '{}'::jsonb,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 200),
  decline_category text,
  surcharge_amount numeric(18,4) not null default 0 check (surcharge_amount >= 0),
  link_id uuid,
  correlation_id text,
  created_by uuid,
  authorized_at timestamptz,
  captured_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (captured_amount <= amount + surcharge_amount),
  check (refunded_amount <= captured_amount)
);
create unique index if not exists uq_payments_idempotency on public.payments (company_id, idempotency_key);
create unique index if not exists uq_payments_transaction on public.payments (processor_id, processor_transaction_id) where processor_transaction_id is not null;
-- Concurrent payment guard: one open payment per invoice.
create unique index if not exists uq_payments_open_invoice on public.payments (invoice_id) where status in ('created', 'requires_action', 'authorized', 'pending_review') and deleted_at is null;
create index if not exists idx_payments_company on public.payments (company_id, created_at desc);
create index if not exists idx_payments_invoice on public.payments (invoice_id, created_at desc);
create index if not exists idx_payments_card on public.payments (card_identity_id, created_at desc) where card_identity_id is not null;

create table if not exists public.payment_attempts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  processor_id text,
  action text not null check (action in ('authorize', 'charge', 'capture', 'void', 'refund', 'status')),
  outcome text not null check (outcome in ('authorized', 'captured', 'requires_action', 'declined', 'voided', 'refunded', 'pending', 'error', 'blocked')),
  decline_category text,
  counted_failure boolean not null default false,
  raw_code text check (raw_code is null or char_length(raw_code) <= 80),
  message text check (message is null or char_length(message) <= 300),
  card_identity_id uuid references public.card_identities (id) on delete restrict,
  payer_ip text check (payer_ip is null or char_length(payer_ip) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create index if not exists idx_payment_attempts_card on public.payment_attempts (card_identity_id, created_at desc) where card_identity_id is not null;
create index if not exists idx_payment_attempts_ip on public.payment_attempts (payer_ip, created_at desc) where payer_ip is not null;
create index if not exists idx_payment_attempts_payment on public.payment_attempts (payment_id, created_at);

create table if not exists public.payment_allocations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_payment_allocations on public.payment_allocations (payment_id, invoice_id) where deleted_at is null;

create table if not exists public.refunds (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  reason text check (reason is null or char_length(reason) <= 300),
  status text not null default 'requested' check (status in ('requested', 'pending_approval', 'processing', 'succeeded', 'failed', 'rejected')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  approval_request_id uuid,
  processor_refund_id text,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 200),
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_refunds_idempotency on public.refunds (company_id, idempotency_key);
create index if not exists idx_refunds_payment on public.refunds (payment_id, created_at);

create table if not exists public.payment_links (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  token_id uuid,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'paid', 'expired', 'revoked')),
  amount numeric(18,4) check (amount is null or amount > 0),
  expires_at timestamptz not null,
  use_count integer not null default 0 check (use_count >= 0),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_payment_links_hash on public.payment_links (token_hash);
create index if not exists idx_payment_links_invoice on public.payment_links (invoice_id, created_at desc);

create table if not exists public.webhook_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null,
  event_id text not null check (char_length(event_id) between 1 and 200),
  event_type text not null check (char_length(event_type) between 1 and 60),
  processor_transaction_id text,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'dead_letter', 'ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  error text check (error is null or char_length(error) <= 300),
  occurred_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_webhook_events_event on public.webhook_events (processor_id, event_id);
create index if not exists idx_webhook_events_status on public.webhook_events (status, next_retry_at);

create table if not exists public.payment_reviews (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  reasons text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'captured', 'voided', 'expired')),
  hold_until timestamptz not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_payment_reviews_payment on public.payment_reviews (payment_id);
create index if not exists idx_payment_reviews_open on public.payment_reviews (status, hold_until);

-- Credential rows never change except for the flags that retire them.
create or replace function public.kd_credentials_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(new) - array['is_current', 'updated_at', 'version', 'deleted_at', 'updated_by'])
     is distinct from (to_jsonb(old) - array['is_current', 'updated_at', 'version', 'deleted_at', 'updated_by']) then
    raise exception 'stored credentials cannot be edited, save a new version' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_processor_credentials_guard on public.processor_credentials;
create trigger trg_processor_credentials_guard before update on public.processor_credentials for each row execute function public.kd_credentials_guard();

-- Only legal status changes; money and identity columns are fixed once the payment exists.
create or replace function public.kd_payment_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  ok boolean;
begin
  if new.amount is distinct from old.amount or new.currency is distinct from old.currency
     or new.invoice_id is distinct from old.invoice_id or new.company_id is distinct from old.company_id
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'the amount, invoice and key of a payment cannot change' using errcode = '42501';
  end if;
  if new.processor_id is distinct from old.processor_id and old.processor_id is not null then
    raise exception 'the processor of a payment cannot change' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'created' then new.status in ('requires_action', 'authorized', 'captured', 'failed', 'pending_review', 'voided')
      when 'requires_action' then new.status in ('authorized', 'captured', 'failed', 'voided', 'pending_review')
      when 'authorized' then new.status in ('captured', 'voided', 'failed', 'pending_review')
      when 'pending_review' then new.status in ('captured', 'voided', 'failed')
      when 'captured' then new.status in ('partially_refunded', 'refunded')
      when 'partially_refunded' then new.status in ('refunded')
      else false
    end;
    if not ok then
      raise exception 'illegal payment status change % -> %', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_payments_guard on public.payments;
create trigger trg_payments_guard before update on public.payments for each row execute function public.kd_payment_guard();

-- Attempts and decisions are a log: never edited, never deleted.
drop trigger if exists trg_payment_attempts_append on public.payment_attempts;
create trigger trg_payment_attempts_append before update or delete on public.payment_attempts for each row execute function public.kd_invoice_append_only();
drop trigger if exists trg_processor_mode_tests_append on public.processor_mode_tests;
create trigger trg_processor_mode_tests_append before update or delete on public.processor_mode_tests for each row execute function public.kd_invoice_append_only();

-- Mode switch: one transaction, only after a passing test for the target mode, the current credentials, the current
-- environment and within the validity window. Returns the test id that allowed it.
create or replace function public.kd_processor_switch_mode(p_processor text, p_mode text, p_by uuid, p_valid_hours integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proc record;
  test_id uuid;
begin
  select * into proc from public.processors where processor_id = p_processor and deleted_at is null for update;
  if not found then raise exception 'unknown processor' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.processor_modes where processor_id = p_processor and mode_id = p_mode and deleted_at is null) then
    raise exception 'unknown mode' using errcode = 'P0002';
  end if;
  select id into test_id from public.processor_mode_tests
    where processor_id = p_processor and mode_id = p_mode and environment = proc.environment
      and credentials_version = proc.credentials_version and ok
      and tested_at > now() - make_interval(hours => p_valid_hours)
    order by tested_at desc limit 1;
  if test_id is null then raise exception 'no passing test for this mode' using errcode = '42501'; end if;
  update public.processor_modes set is_active = false, updated_at = now() where processor_id = p_processor and is_active;
  update public.processor_modes set is_active = true, switched_by = p_by, switched_at = now() where processor_id = p_processor and mode_id = p_mode and deleted_at is null;
  update public.processors set active_mode = p_mode, updated_by = p_by, enabled = false, disabled_reason = 'mode changed, test again', last_test_ok = null where id = proc.id;
  return test_id;
end
$$;
revoke all on function public.kd_processor_switch_mode(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.kd_processor_switch_mode(text, text, uuid, integer) to service_role;

-- Counts used by the card rules (one round trip). The window arguments come from config/payment-risk.ts.
-- ip_distinct_cards counts the other cards seen from this address, so a card that is already known is never refused for it.
create or replace function public.kd_card_stats(p_identity uuid, p_ip text, p_invoice uuid, p_fail_hours integer, p_velocity_hours integer, p_same_invoice_hours integer)
returns table (counted_failures integer, card_attempts integer, ip_attempts integer, ip_distinct_cards integer, paid_same_invoice integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.payment_attempts a where a.card_identity_id = p_identity and a.counted_failure and a.created_at > now() - make_interval(hours => p_fail_hours)),
    (select count(*)::int from public.payment_attempts a where a.card_identity_id = p_identity and a.action in ('authorize', 'charge') and a.created_at > now() - make_interval(hours => p_velocity_hours)),
    (select count(*)::int from public.payment_attempts a where a.payer_ip = p_ip and a.action in ('authorize', 'charge') and a.created_at > now() - make_interval(hours => p_velocity_hours)),
    (select count(distinct a.card_identity_id)::int from public.payment_attempts a where a.payer_ip = p_ip and a.card_identity_id is not null and a.card_identity_id is distinct from p_identity and a.created_at > now() - make_interval(hours => p_velocity_hours)),
    (select count(*)::int from public.payments p where p.card_identity_id = p_identity and p.invoice_id = p_invoice and p.status in ('captured', 'authorized', 'partially_refunded', 'refunded') and p.created_at > now() - make_interval(hours => p_same_invoice_hours));
$$;
revoke all on function public.kd_card_stats(uuid, text, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.kd_card_stats(uuid, text, uuid, integer, integer, integer) to service_role;

select public.apply_standard_triggers('public.processors');
select public.apply_standard_triggers('public.processor_credentials');
select public.apply_standard_triggers('public.processor_modes');
select public.apply_standard_triggers('public.processor_mode_tests');
select public.apply_standard_triggers('public.routing_rules');
select public.apply_standard_triggers('public.card_identities');
select public.apply_standard_triggers('public.card_blacklist');
select public.apply_standard_triggers('public.payments');
select public.apply_standard_triggers('public.payment_attempts');
select public.apply_standard_triggers('public.payment_allocations');
select public.apply_standard_triggers('public.refunds');
select public.apply_standard_triggers('public.payment_links');
select public.apply_standard_triggers('public.webhook_events');
select public.apply_standard_triggers('public.payment_reviews');
select public.rls_enable_default_deny('public.processors');
select public.rls_enable_default_deny('public.processor_credentials');
select public.rls_enable_default_deny('public.processor_modes');
select public.rls_enable_default_deny('public.processor_mode_tests');
select public.rls_enable_default_deny('public.routing_rules');
select public.rls_enable_default_deny('public.card_identities');
select public.rls_enable_default_deny('public.card_blacklist');
select public.rls_enable_default_deny('public.payments');
select public.rls_enable_default_deny('public.payment_attempts');
select public.rls_enable_default_deny('public.payment_allocations');
select public.rls_enable_default_deny('public.refunds');
select public.rls_enable_default_deny('public.payment_links');
select public.rls_enable_default_deny('public.webhook_events');
select public.rls_enable_default_deny('public.payment_reviews');

revoke all on public.processors, public.processor_credentials, public.processor_modes, public.processor_mode_tests, public.routing_rules,
  public.card_identities, public.card_blacklist, public.payments, public.payment_attempts, public.payment_allocations, public.refunds,
  public.payment_links, public.webhook_events, public.payment_reviews from authenticated;
