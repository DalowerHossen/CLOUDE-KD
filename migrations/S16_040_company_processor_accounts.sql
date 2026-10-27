-- path: migrations/S16_040_company_processor_accounts.sql
-- A company's own merchant account at a payment processor. When a company has an active account for the processor that a
-- payment is routed to, the payment is made with that account's credentials and the money goes to that merchant; without
-- one the platform's own account is used, as before. The credentials are sealed like the platform's (ciphertext, iv, tag,
-- key version); only the server (service role) reads them. A payment remembers the account it was made with.
create table if not exists public.company_processor_accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'live')),
  status text not null default 'disabled' check (status in ('active', 'disabled')),
  ciphertext text not null check (char_length(ciphertext) between 1 and 20000),
  iv text not null check (char_length(iv) between 8 and 64),
  tag text not null check (char_length(tag) between 8 and 64),
  key_version integer not null check (key_version >= 1),
  field_keys text[] not null default '{}',
  last_chars jsonb not null default '{}'::jsonb,
  application_id uuid references public.processor_applications (id) on delete restrict,
  merchant_reference text check (merchant_reference is null or char_length(merchant_reference) <= 60),
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.company_processor_accounts');
select public.rls_enable_default_deny('public.company_processor_accounts');
select public.audit_enable_for('public.company_processor_accounts');

create unique index if not exists uq_company_processor_account on public.company_processor_accounts (company_id, processor_id) where deleted_at is null;
create index if not exists ix_company_processor_accounts_processor on public.company_processor_accounts (processor_id, status) where deleted_at is null;

alter table public.payments add column if not exists account_id uuid references public.company_processor_accounts (id) on delete restrict;
create index if not exists ix_payments_account on public.payments (account_id) where account_id is not null;
