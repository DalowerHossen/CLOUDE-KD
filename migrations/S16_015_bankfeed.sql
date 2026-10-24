-- path: migrations/S16_015_bankfeed.sql
-- STEP 16.7 Bank feed (Plaid and Salt Edge).
--   bank_feed_connections  a bank link of a company at an aggregator: the keys of the company (encrypted), the link (encrypted),
--                          the random key of its webhook address, its state and the cursor of the last sync.
--   bank_feed_accounts     an account that the aggregator reported, and the bank account of the books it is mapped to.
--   bank_feed_batches      one import into the books: the key of the batch makes a repeat harmless.

create table if not exists public.bank_feed_connections (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  provider text not null check (provider in ('plaid', 'saltedge')),
  name text not null check (char_length(name) between 1 and 120),
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  credentials_enc jsonb not null check (jsonb_typeof(credentials_enc) = 'object'),
  link_enc jsonb check (link_enc is null or jsonb_typeof(link_enc) = 'object'),
  secret_last4 text check (secret_last4 is null or char_length(secret_last4) = 4),
  webhook_key text not null check (webhook_key ~ '^[0-9A-Za-z]{32}$'),
  link_token text check (link_token is null or char_length(link_token) <= 200),
  external_id text check (external_id is null or char_length(external_id) between 1 and 100),
  institution_name text check (institution_name is null or char_length(institution_name) <= 200),
  status text not null default 'new' check (status in ('new', 'linking', 'active', 'needs_reauth', 'disconnected', 'error')),
  sync_cursor text check (sync_cursor is null or char_length(sync_cursor) <= 500),
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  reauth_notified_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status not in ('active', 'needs_reauth') or external_id is not null)
);

create table if not exists public.bank_feed_accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  connection_id uuid not null references public.bank_feed_connections (id) on delete restrict,
  external_id text not null check (char_length(external_id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 200),
  mask text check (mask is null or char_length(mask) <= 20),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  bank_account_id uuid,
  enabled boolean not null default true,
  sync_cursor text check (sync_cursor is null or char_length(sync_cursor) <= 100),
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.bank_feed_batches (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  connection_id uuid not null references public.bank_feed_connections (id) on delete restrict,
  feed_account_id uuid not null references public.bank_feed_accounts (id) on delete restrict,
  batch_key text not null check (char_length(batch_key) between 1 and 200),
  line_count integer not null default 0 check (line_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  left_out_count integer not null default 0 check (left_out_count >= 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  status text not null default 'done' check (status in ('done', 'failed')),
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (imported_count + skipped_count <= line_count)
);

select public.apply_standard_triggers('public.bank_feed_connections');
select public.apply_standard_triggers('public.bank_feed_accounts');
select public.apply_standard_triggers('public.bank_feed_batches');
select public.rls_enable_default_deny('public.bank_feed_connections');
select public.rls_enable_default_deny('public.bank_feed_accounts');
select public.rls_enable_default_deny('public.bank_feed_batches');
select public.audit_enable_for('public.bank_feed_connections');
select public.audit_enable_for('public.bank_feed_accounts');

create unique index if not exists uq_bank_feed_key on public.bank_feed_connections (webhook_key);
-- One link at the aggregator belongs to one company (a webhook says which link it is about).
create unique index if not exists uq_bank_feed_external on public.bank_feed_connections (provider, external_id) where external_id is not null and deleted_at is null;
create index if not exists ix_bank_feed_company on public.bank_feed_connections (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_bank_feed_due on public.bank_feed_connections (last_synced_at nulls first) where status = 'active' and deleted_at is null;
create unique index if not exists uq_bank_feed_accounts on public.bank_feed_accounts (connection_id, external_id) where deleted_at is null;
create index if not exists ix_bank_feed_accounts_mapped on public.bank_feed_accounts (bank_account_id) where bank_account_id is not null and deleted_at is null;
create unique index if not exists uq_bank_feed_batches on public.bank_feed_batches (feed_account_id, batch_key);
create index if not exists ix_bank_feed_batches on public.bank_feed_batches (connection_id, created_at desc);

-- Rows that point to a link (and an account) belong to the company of that link.
create or replace function public.kd_bank_feed_child_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_connection uuid; v_account uuid;
begin
  select company_id into v_company from public.bank_feed_connections where id = new.connection_id and deleted_at is null;
  if v_company is null or v_company <> new.company_id then raise exception 'the bank link was not found' using errcode = 'P0002'; end if;
  v_account := nullif(to_jsonb(new) ->> 'feed_account_id', '')::uuid;
  if v_account is not null then
    select connection_id into v_connection from public.bank_feed_accounts where id = v_account and company_id = new.company_id;
    if v_connection is null or v_connection <> new.connection_id then raise exception 'the bank feed account was not found' using errcode = 'P0002'; end if;
  end if;
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.connection_id is distinct from old.connection_id) then
    raise exception 'the link of a row does not change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_bank_feed_accounts_guard on public.bank_feed_accounts;
create trigger trg_bank_feed_accounts_guard before insert or update on public.bank_feed_accounts for each row execute function public.kd_bank_feed_child_guard();
drop trigger if exists trg_bank_feed_batches_guard on public.bank_feed_batches;
create trigger trg_bank_feed_batches_guard before insert or update on public.bank_feed_batches for each row execute function public.kd_bank_feed_child_guard();

-- The identity of a link does not change; a disconnected link stays disconnected (a new link is a new row).
create or replace function public.kd_bank_feed_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id or new.provider is distinct from old.provider then
    raise exception 'the provider of a bank link does not change' using errcode = '55000';
  end if;
  if old.external_id is not null and new.external_id is distinct from old.external_id then
    raise exception 'the link at the aggregator does not change' using errcode = '55000';
  end if;
  if old.status = 'disconnected' and new.status <> 'disconnected' then
    raise exception 'a disconnected bank link stays disconnected' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_bank_feed_connections_guard on public.bank_feed_connections;
create trigger trg_bank_feed_connections_guard before update on public.bank_feed_connections for each row execute function public.kd_bank_feed_guard();
