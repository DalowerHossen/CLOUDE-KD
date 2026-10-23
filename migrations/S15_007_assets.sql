-- path: migrations/S15_007_assets.sql
-- STEP 15.7.a Fixed assets and depreciation.
--   asset_categories    equipment, furniture, vehicle, software, building: the usual method and life, and the accounts used.
--   fixed_assets        an asset: cost, salvage value, life in months, depreciation method, place, serial number, warranty and
--                       the state (active, sold, disposed). Cost, start date, method and life cannot change once depreciation
--                       has been booked, and a sold or disposed asset does not change.
--   asset_depreciation  one row per asset and month: the amount booked (append only; one row per asset and month).
--   asset_usage         units used in a month (for the units of production method).
--   asset_documents     photos and documents of an asset, kept through the storage contract.

create table if not exists public.asset_categories (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  method text not null default 'straight_line' check (method in ('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years')),
  life_months integer not null default 60 check (life_months between 1 and 1200),
  asset_account_id uuid references public.accounts (id) on delete restrict,
  accumulated_account_id uuid references public.accounts (id) on delete restrict,
  expense_account_id uuid references public.accounts (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.fixed_assets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  category_id uuid not null references public.asset_categories (id) on delete restrict,
  purchase_date date not null,
  in_service_date date not null,
  cost numeric(18,4) not null check (cost > 0),
  salvage_value numeric(18,4) not null default 0 check (salvage_value >= 0),
  life_months integer not null check (life_months between 1 and 1200),
  method text not null check (method in ('straight_line', 'declining_balance', 'units_of_production', 'sum_of_years')),
  declining_factor numeric(18,4) not null default 2 check (declining_factor between 1 and 4),
  total_units numeric(18,4) check (total_units is null or total_units > 0),
  location text not null default '' check (char_length(location) <= 120),
  serial_number text not null default '' check (char_length(serial_number) <= 80),
  vendor text not null default '' check (char_length(vendor) <= 120),
  warranty_until date,
  warranty_note text not null default '' check (char_length(warranty_note) <= 300),
  status text not null default 'active' check (status in ('active', 'sold', 'disposed')),
  purchase_entry_id uuid references public.journal_entries (id) on delete restrict,
  disposed_on date,
  disposal_proceeds numeric(18,4) check (disposal_proceeds is null or disposal_proceeds >= 0),
  disposal_gain_loss numeric(18,4),
  disposal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (salvage_value <= cost),
  check (in_service_date >= purchase_date),
  check (method <> 'units_of_production' or total_units is not null),
  check ((status = 'active') = (disposed_on is null))
);

create table if not exists public.asset_depreciation (
  -- guard:append-only (the depreciation booked for one month; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  asset_id uuid not null references public.fixed_assets (id) on delete restrict,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  amount numeric(18,4) not null check (amount >= 0),
  units numeric(18,4) check (units is null or units >= 0),
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_usage (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  asset_id uuid not null references public.fixed_assets (id) on delete restrict,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  units numeric(18,4) not null check (units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.asset_documents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  asset_id uuid not null references public.fixed_assets (id) on delete restrict,
  file_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.asset_categories');
select public.apply_standard_triggers('public.fixed_assets');
select public.apply_standard_triggers('public.asset_usage');
select public.apply_standard_triggers('public.asset_documents');
select public.rls_enable_default_deny('public.asset_categories');
select public.rls_enable_default_deny('public.fixed_assets');
select public.rls_enable_default_deny('public.asset_depreciation');
select public.rls_enable_default_deny('public.asset_usage');
select public.rls_enable_default_deny('public.asset_documents');
select public.audit_enable_for('public.asset_categories');
select public.audit_enable_for('public.fixed_assets');
select public.audit_enable_for('public.asset_depreciation');
select public.audit_enable_for('public.asset_usage');
select public.audit_enable_for('public.asset_documents');

drop trigger if exists trg_asset_depreciation_append on public.asset_depreciation;
create trigger trg_asset_depreciation_append before update or delete on public.asset_depreciation for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_asset_categories_name on public.asset_categories (company_id, lower(name)) where deleted_at is null;
create index if not exists ix_fixed_assets_company on public.fixed_assets (company_id, status) where deleted_at is null;
create index if not exists ix_fixed_assets_category on public.fixed_assets (category_id) where deleted_at is null;
create unique index if not exists uq_asset_depreciation_month on public.asset_depreciation (asset_id, period_month);
create index if not exists ix_asset_depreciation_company on public.asset_depreciation (company_id, period_month);
create unique index if not exists uq_asset_usage_month on public.asset_usage (asset_id, period_month) where deleted_at is null;
create index if not exists ix_asset_documents on public.asset_documents (asset_id) where deleted_at is null;

-- Category accounts: the asset account is an asset, the accumulated account an asset (contra), the expense account an expense.
create or replace function public.kd_asset_category_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v public.accounts;
begin
  if new.asset_account_id is not null then
    select * into v from public.accounts where id = new.asset_account_id and deleted_at is null;
    if not found or v.company_id <> new.company_id then raise exception 'the asset account was not found' using errcode = 'P0002'; end if;
    if v.type <> 'asset' then raise exception 'the asset account must be an asset account' using errcode = '22023'; end if;
  end if;
  if new.accumulated_account_id is not null then
    select * into v from public.accounts where id = new.accumulated_account_id and deleted_at is null;
    if not found or v.company_id <> new.company_id then raise exception 'the accumulated depreciation account was not found' using errcode = 'P0002'; end if;
    if v.type <> 'asset' or not v.is_contra then raise exception 'accumulated depreciation is a contra asset account' using errcode = '22023'; end if;
  end if;
  if new.expense_account_id is not null then
    select * into v from public.accounts where id = new.expense_account_id and deleted_at is null;
    if not found or v.company_id <> new.company_id then raise exception 'the expense account was not found' using errcode = 'P0002'; end if;
    if v.type <> 'expense' then raise exception 'the depreciation expense account must be an expense account' using errcode = '22023'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_asset_categories_guard on public.asset_categories;
create trigger trg_asset_categories_guard before insert or update on public.asset_categories for each row execute function public.kd_asset_category_guard();

-- Asset rules: the category is of the same company; the terms that depreciation depends on do not change once depreciation exists;
-- a sold or disposed asset does not change.
create or replace function public.kd_fixed_asset_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_cat public.asset_categories;
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select * into v_cat from public.asset_categories where id = new.category_id and deleted_at is null;
    if not found or v_cat.company_id <> new.company_id then raise exception 'the category was not found' using errcode = 'P0002'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'active' and (new.status <> old.status or new.cost <> old.cost or new.disposed_on is distinct from old.disposed_on
       or new.deleted_at is distinct from old.deleted_at) then
      raise exception 'a sold or disposed asset cannot change' using errcode = '55000';
    end if;
    if exists (select 1 from public.asset_depreciation where asset_id = old.id)
       and (new.cost <> old.cost or new.salvage_value <> old.salvage_value or new.life_months <> old.life_months or new.method <> old.method
            or new.in_service_date <> old.in_service_date or new.declining_factor <> old.declining_factor
            or new.total_units is distinct from old.total_units or new.category_id <> old.category_id
            or (new.deleted_at is not null and old.deleted_at is null)) then
      raise exception 'depreciation has been booked; cost, dates, life and method cannot change' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_fixed_assets_guard on public.fixed_assets;
create trigger trg_fixed_assets_guard before insert or update on public.fixed_assets for each row execute function public.kd_fixed_asset_guard();

-- A month of depreciation is booked for an active asset only, from its start month, and never above the depreciable amount.
create or replace function public.kd_asset_depreciation_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_a public.fixed_assets;
  v_before numeric;
begin
  select * into v_a from public.fixed_assets where id = new.asset_id;
  if not found or v_a.company_id <> new.company_id then raise exception 'the asset was not found' using errcode = 'P0002'; end if;
  if new.period_month < date_trunc('month', v_a.in_service_date)::date then raise exception 'depreciation cannot start before the asset is in service' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into v_before from public.asset_depreciation where asset_id = new.asset_id;
  if v_before + new.amount > v_a.cost - v_a.salvage_value then raise exception 'depreciation would pass the depreciable amount' using errcode = '23514'; end if;
  return new;
end
$$;
drop trigger if exists trg_asset_depreciation_guard on public.asset_depreciation;
create trigger trg_asset_depreciation_guard before insert on public.asset_depreciation for each row execute function public.kd_asset_depreciation_guard();

revoke all on public.asset_categories, public.fixed_assets, public.asset_depreciation, public.asset_usage, public.asset_documents from authenticated;
grant all on public.asset_categories, public.fixed_assets, public.asset_depreciation, public.asset_usage, public.asset_documents to service_role;
