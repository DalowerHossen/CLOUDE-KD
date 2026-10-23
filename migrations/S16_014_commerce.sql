-- path: migrations/S16_014_commerce.sql
-- STEP 16.5 Commerce connections (Shopify and WooCommerce).
--   integrations                a connected store, with its credentials encrypted and the random key of its webhook address.
--   integration_orders          an order that a store sent: kept once per store and order id, with its state.
--   integration_webhook_events  the delivery ids already received (a delivery is handled once).
--   integration_sync_log        what happened, one line each (append only).
--   integration_mappings        a store SKU and the product it stands for.
--   integration_conflicts       a mismatch that needs a person (currency, unknown SKU, no e-mail, no billing address, a refund).

create table if not exists public.integrations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  provider text not null check (provider in ('shopify', 'woocommerce')),
  name text not null check (char_length(name) between 1 and 120),
  store_url text not null check (char_length(store_url) between 4 and 200),
  credentials_enc jsonb not null check (jsonb_typeof(credentials_enc) = 'object'),
  secret_last4 text check (secret_last4 is null or char_length(secret_last4) = 4),
  webhook_key text not null check (webhook_key ~ '^[0-9A-Za-z]{32}$'),
  webhook_ready boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'needs_reconnect')),
  sync_mode text not null default 'realtime' check (sync_mode in ('realtime', 'hourly', 'daily')),
  auto_client boolean not null default true,
  shop_name text check (shop_name is null or char_length(shop_name) <= 120),
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.integration_orders (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  external_id text not null check (char_length(external_id) between 1 and 64),
  external_number text check (external_number is null or char_length(external_number) <= 64),
  status text not null default 'received' check (status in ('received', 'conflict', 'client_ready', 'synced', 'failed', 'ignored', 'cancelled')),
  email text check (email is null or char_length(email) <= 254),
  customer_name text check (customer_name is null or char_length(customer_name) <= 200),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  total numeric(18, 4) check (total is null or total >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  client_id uuid,
  invoice_id uuid,
  attempts integer not null default 0 check (attempts between 0 and 50),
  next_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  ordered_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status <> 'synced' or invoice_id is not null)
);

create table if not exists public.integration_webhook_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  webhook_id text not null check (char_length(webhook_id) between 1 and 200),
  topic text not null check (char_length(topic) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.integration_sync_log (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  order_id uuid references public.integration_orders (id) on delete restrict,
  event text not null check (event in ('connect', 'webhook', 'order', 'client', 'invoice', 'mapping', 'conflict', 'refund', 'retry', 'check')),
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.integration_mappings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  external_sku text not null check (char_length(external_sku) between 1 and 120),
  product_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.integration_conflicts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  integration_id uuid not null references public.integrations (id) on delete restrict,
  order_id uuid not null references public.integration_orders (id) on delete restrict,
  kind text not null check (kind in ('currency', 'unmapped_sku', 'no_email', 'no_address', 'refund')),
  detail text not null check (char_length(detail) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolution text check (resolution is null or char_length(resolution) <= 300),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'open') = (resolved_at is null))
);

select public.apply_standard_triggers('public.integrations');
select public.apply_standard_triggers('public.integration_orders');
select public.apply_standard_triggers('public.integration_webhook_events');
select public.apply_standard_triggers('public.integration_sync_log');
select public.apply_standard_triggers('public.integration_mappings');
select public.apply_standard_triggers('public.integration_conflicts');
select public.rls_enable_default_deny('public.integrations');
select public.rls_enable_default_deny('public.integration_orders');
select public.rls_enable_default_deny('public.integration_webhook_events');
select public.rls_enable_default_deny('public.integration_sync_log');
select public.rls_enable_default_deny('public.integration_mappings');
select public.rls_enable_default_deny('public.integration_conflicts');
select public.audit_enable_for('public.integrations');
select public.audit_enable_for('public.integration_orders');
select public.audit_enable_for('public.integration_mappings');
select public.audit_enable_for('public.integration_conflicts');

-- A store belongs to one company at a time (a webhook says which store it comes from); the webhook key is unique.
create unique index if not exists uq_integrations_store on public.integrations (provider, lower(store_url)) where deleted_at is null;
create unique index if not exists uq_integrations_key on public.integrations (webhook_key);
create index if not exists ix_integrations_company on public.integrations (company_id, created_at desc) where deleted_at is null;
create unique index if not exists uq_integration_orders on public.integration_orders (integration_id, external_id);
create index if not exists ix_integration_orders_company on public.integration_orders (company_id, received_at desc) where deleted_at is null;
create index if not exists ix_integration_orders_retry on public.integration_orders (next_attempt_at) where status in ('failed', 'received') and deleted_at is null;
create unique index if not exists uq_integration_webhook_events on public.integration_webhook_events (integration_id, webhook_id);
create index if not exists ix_integration_sync_log on public.integration_sync_log (integration_id, created_at desc);
create unique index if not exists uq_integration_mappings on public.integration_mappings (integration_id, lower(external_sku)) where deleted_at is null;
create unique index if not exists uq_integration_conflicts on public.integration_conflicts (order_id, kind, detail);
create index if not exists ix_integration_conflicts_open on public.integration_conflicts (company_id, created_at desc) where status = 'open';

-- Rows that point to a store (or an order) belong to the company of that store.
create or replace function public.kd_integration_child_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_integration uuid; v_order uuid;
begin
  select company_id into v_company from public.integrations where id = new.integration_id and deleted_at is null;
  if v_company is null or v_company <> new.company_id then raise exception 'the store was not found' using errcode = 'P0002'; end if;
  v_order := nullif(to_jsonb(new) ->> 'order_id', '')::uuid;
  if tg_table_name in ('integration_sync_log', 'integration_conflicts') and v_order is not null then
    select integration_id into v_integration from public.integration_orders where id = v_order and company_id = new.company_id;
    if v_integration is null or v_integration <> new.integration_id then raise exception 'the order was not found' using errcode = 'P0002'; end if;
  end if;
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.integration_id is distinct from old.integration_id) then
    raise exception 'the store of a row does not change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_integration_orders_guard on public.integration_orders;
create trigger trg_integration_orders_guard before insert or update on public.integration_orders for each row execute function public.kd_integration_child_guard();
drop trigger if exists trg_integration_events_guard on public.integration_webhook_events;
create trigger trg_integration_events_guard before insert or update on public.integration_webhook_events for each row execute function public.kd_integration_child_guard();
drop trigger if exists trg_integration_log_guard on public.integration_sync_log;
create trigger trg_integration_log_guard before insert or update on public.integration_sync_log for each row execute function public.kd_integration_child_guard();
drop trigger if exists trg_integration_mappings_guard on public.integration_mappings;
create trigger trg_integration_mappings_guard before insert or update on public.integration_mappings for each row execute function public.kd_integration_child_guard();
drop trigger if exists trg_integration_conflicts_guard on public.integration_conflicts;
create trigger trg_integration_conflicts_guard before insert or update on public.integration_conflicts for each row execute function public.kd_integration_child_guard();

-- The log and the delivery ids are append only (only the removal of an old row, a soft delete, is allowed).
create or replace function public.kd_integration_append_only() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null and (to_jsonb(new) - 'deleted_at' - 'updated_at' - 'version') = (to_jsonb(old) - 'deleted_at' - 'updated_at' - 'version') then
    return new;
  end if;
  raise exception 'this history does not change' using errcode = '55000';
end
$$;
drop trigger if exists trg_integration_log_append on public.integration_sync_log;
create trigger trg_integration_log_append before update on public.integration_sync_log for each row execute function public.kd_integration_append_only();
drop trigger if exists trg_integration_events_append on public.integration_webhook_events;
create trigger trg_integration_events_append before update on public.integration_webhook_events for each row execute function public.kd_integration_append_only();

-- The identity of a store does not change. An order moves one way; synced, ignored and cancelled are final, and the order id and
-- store never change.
create or replace function public.kd_integration_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id or new.provider is distinct from old.provider or lower(new.store_url) is distinct from lower(old.store_url) then
    raise exception 'the provider and address of a store do not change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_integrations_guard on public.integrations;
create trigger trg_integrations_guard before update on public.integrations for each row execute function public.kd_integration_guard();

create or replace function public.kd_integration_order_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare ok boolean;
begin
  if new.external_id is distinct from old.external_id then raise exception 'the order id does not change' using errcode = '55000'; end if;
  if old.status in ('synced', 'ignored', 'cancelled') and (new.status is distinct from old.status or new.payload is distinct from old.payload) then
    raise exception 'a finished order does not change' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'received' then new.status in ('conflict', 'client_ready', 'failed', 'ignored', 'cancelled')
      when 'conflict' then new.status in ('received', 'ignored', 'cancelled')
      when 'client_ready' then new.status in ('synced', 'failed', 'cancelled', 'received')
      when 'failed' then new.status in ('received', 'ignored', 'cancelled')
      else false end;
    if not ok then raise exception 'an order cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_integration_orders_state on public.integration_orders;
create trigger trg_integration_orders_state before update on public.integration_orders for each row execute function public.kd_integration_order_guard();
