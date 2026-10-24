-- path: migrations/S08_005_inventory.sql
-- STEP 08.5 Inventory: warehouses, stock levels and the append-only movement ledger. Stock changes only through the
-- functions below, which lock the level row, so stock never goes negative however many requests run at once.

alter table public.products add column if not exists reorder_level numeric(18,4) check (reorder_level is null or reorder_level >= 0);

create table if not exists public.warehouses (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$'),
  address_line1 text not null default '' check (char_length(address_line1) <= 200),
  address_city text not null default '' check (char_length(address_city) <= 100),
  address_region text not null default '' check (char_length(address_region) <= 100),
  address_postal_code text not null default '' check (char_length(address_postal_code) <= 20),
  address_country char(2) check (address_country is null or address_country ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (not is_default or is_active)
);

create table if not exists public.stock_levels (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  quantity numeric(18,4) not null default 0 check (quantity >= 0),
  alert_state text not null default 'ok' check (alert_state in ('ok', 'low', 'out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.stock_movements (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  kind text not null check (kind in ('receipt', 'issue', 'sale', 'adjustment', 'transfer_out', 'transfer_in', 'return_in', 'return_out', 'count')),
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  balance_after numeric(18,4) not null check (balance_after >= 0),
  unit_cost numeric(18,4) check (unit_cost is null or unit_cost >= 0),
  reason text check (reason is null or reason in ('damage', 'loss', 'return', 'correction', 'found', 'other')),
  reference_type text check (reference_type is null or reference_type ~ '^[a-z_]{2,30}$'),
  reference_id uuid,
  note text not null default '' check (char_length(note) <= 500),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 1 and 120),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.warehouses');
select public.apply_standard_triggers('public.stock_levels');
select public.rls_enable_default_deny('public.warehouses');
select public.rls_enable_default_deny('public.stock_levels');
select public.rls_enable_default_deny('public.stock_movements');
select public.audit_enable_for('public.warehouses');
select public.audit_enable_for('public.stock_levels');
select public.audit_enable_for('public.stock_movements');

revoke all on public.warehouses, public.stock_levels, public.stock_movements from authenticated;
grant all on public.warehouses, public.stock_levels, public.stock_movements to service_role;

create unique index if not exists uq_warehouse_code on public.warehouses (company_id, lower(code)) where deleted_at is null;
create unique index if not exists uq_warehouse_default on public.warehouses (company_id) where is_default and deleted_at is null;
create unique index if not exists uq_stock_level on public.stock_levels (warehouse_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;
create index if not exists ix_stock_levels_product on public.stock_levels (company_id, product_id) where deleted_at is null;
create index if not exists ix_stock_levels_alert on public.stock_levels (company_id, alert_state) where deleted_at is null and alert_state <> 'ok';
create unique index if not exists uq_stock_movement_key on public.stock_movements (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists ix_stock_movements_product on public.stock_movements (company_id, product_id, created_at desc);
create index if not exists ix_stock_movements_ref on public.stock_movements (company_id, reference_type, reference_id) where reference_id is not null;

-- The ledger is append only: rows are never changed or removed.
create or replace function public.kd_stock_ledger_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'the stock ledger is append only' using errcode = '42501';
end
$$;
drop trigger if exists trg_stock_movements_no_update on public.stock_movements;
create trigger trg_stock_movements_no_update before update or delete on public.stock_movements
  for each row execute function public.kd_stock_ledger_guard();

-- Changes the stock of one product (and variant) in one warehouse by p_delta, or to p_target when that is given.
-- The level row is locked while the change is made, so two requests never read the same quantity. A change that would
-- take the quantity below zero raises KD001 and changes nothing. The same p_key again returns the first answer.
-- Returns the movement id, the new quantity, the alert state when it just changed to low or out (else null), the
-- applied delta and whether this call was a replay.
create or replace function public.kd_stock_move(
  p_company uuid, p_product uuid, p_variant uuid, p_warehouse uuid, p_delta numeric, p_target numeric,
  p_kind text, p_reason text, p_ref_type text, p_ref_id uuid, p_note text, p_by uuid, p_key text, p_unit_cost numeric
) returns table (movement_id uuid, balance numeric, alert text, applied numeric, replay boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  prod public.products%rowtype;
  lvl public.stock_levels%rowtype;
  old_qty numeric;
  new_qty numeric;
  delta numeric;
  state text;
  alert_out text := null;
  mv uuid;
  prior public.stock_movements%rowtype;
begin
  if p_key is not null then
    select * into prior from public.stock_movements where company_id = p_company and idempotency_key = p_key;
    if found then
      return query select prior.id, prior.balance_after, null::text, prior.quantity_delta, true;
      return;
    end if;
  end if;
  select * into prod from public.products where id = p_product and company_id = p_company and deleted_at is null;
  if not found then raise exception 'product not found' using errcode = '22023'; end if;
  if prod.kind <> 'product' or not prod.track_inventory then raise exception 'stock is not tracked for this item' using errcode = '22023'; end if;
  if p_variant is not null then
    perform 1 from public.product_variants where id = p_variant and product_id = p_product and company_id = p_company and deleted_at is null;
    if not found then raise exception 'variant not found' using errcode = '22023'; end if;
  end if;
  perform 1 from public.warehouses where id = p_warehouse and company_id = p_company and deleted_at is null and is_active;
  if not found then raise exception 'warehouse not found' using errcode = '22023'; end if;

  insert into public.stock_levels (company_id, product_id, variant_id, warehouse_id)
  values (p_company, p_product, p_variant, p_warehouse)
  on conflict (warehouse_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null do nothing;
  select * into lvl from public.stock_levels
   where warehouse_id = p_warehouse and product_id = p_product and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_variant, '00000000-0000-0000-0000-000000000000'::uuid)
     and deleted_at is null
   for update;

  old_qty := lvl.quantity;
  delta := coalesce(p_target - old_qty, p_delta);
  if delta is null or delta = 0 then
    return query select null::uuid, old_qty, null::text, 0::numeric, false;
    return;
  end if;
  new_qty := old_qty + delta;
  if new_qty < 0 then
    raise exception 'insufficient stock: available %', old_qty using errcode = 'KD001';
  end if;
  state := case when new_qty = 0 then 'out' when prod.reorder_level is not null and new_qty <= prod.reorder_level then 'low' else 'ok' end;
  if state <> lvl.alert_state and state <> 'ok' then alert_out := state; end if;
  update public.stock_levels set quantity = new_qty, alert_state = state where id = lvl.id;
  insert into public.stock_movements (company_id, product_id, variant_id, warehouse_id, kind, quantity_delta, balance_after, unit_cost, reason, reference_type, reference_id, note, idempotency_key, created_by)
  values (p_company, p_product, p_variant, p_warehouse, p_kind, delta, new_qty, p_unit_cost, p_reason, p_ref_type, p_ref_id, coalesce(p_note, ''), p_key, p_by)
  returning id into mv;
  return query select mv, new_qty, alert_out, delta, false;
end
$$;

-- Moves stock between two warehouses in one step. Both level rows are locked in a fixed order so opposite transfers
-- cannot wait on each other. Raises KD001 when the source has too little.
create or replace function public.kd_stock_transfer(
  p_company uuid, p_product uuid, p_variant uuid, p_from uuid, p_to uuid, p_qty numeric, p_by uuid, p_key text, p_note text
) returns table (out_balance numeric, in_balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  a uuid := least(p_from, p_to);
  b uuid := greatest(p_from, p_to);
  w uuid;
  o record;
  i record;
begin
  if p_from = p_to then raise exception 'choose two different warehouses' using errcode = '22023'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be above zero' using errcode = '22023'; end if;
  foreach w in array array[a, b] loop
    perform 1 from public.warehouses where id = w and company_id = p_company and deleted_at is null and is_active;
    if not found then raise exception 'warehouse not found' using errcode = '22023'; end if;
    insert into public.stock_levels (company_id, product_id, variant_id, warehouse_id)
    values (p_company, p_product, p_variant, w)
    on conflict (warehouse_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null do nothing;
    perform 1 from public.stock_levels
     where warehouse_id = w and product_id = p_product and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_variant, '00000000-0000-0000-0000-000000000000'::uuid) and deleted_at is null
     for update;
  end loop;
  select * into o from public.kd_stock_move(p_company, p_product, p_variant, p_from, -p_qty, null, 'transfer_out', null, 'transfer', null, p_note, p_by, case when p_key is null then null else p_key || ':out' end, null);
  select * into i from public.kd_stock_move(p_company, p_product, p_variant, p_to, p_qty, null, 'transfer_in', null, 'transfer', null, p_note, p_by, case when p_key is null then null else p_key || ':in' end, null);
  return query select o.balance, i.balance;
end
$$;

revoke all on function public.kd_stock_move(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric),
  public.kd_stock_transfer(uuid, uuid, uuid, uuid, uuid, numeric, uuid, text, text), public.kd_stock_ledger_guard() from public, anon, authenticated;
grant execute on function public.kd_stock_move(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric),
  public.kd_stock_transfer(uuid, uuid, uuid, uuid, uuid, numeric, uuid, text, text) to service_role;

-- Moves stock for many lines in one step (an invoice, a return, a delivery). All lines succeed or none does. Lines of
-- items that do not track stock are skipped. A line without a warehouse uses the default warehouse of the company.
-- p_lines: [{productId, variantId, warehouseId, quantity}]; p_direction 'out' takes stock, 'in' gives it back.
-- Returns the alerts raised: [{productId, state}]. Raises KD001 when a line would take stock below zero.
create or replace function public.kd_stock_move_many(
  p_company uuid, p_lines jsonb, p_direction text, p_kind text, p_ref_type text, p_ref_id uuid, p_by uuid, p_key text
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  l record;
  dflt uuid;
  r record;
  n integer := 0;
  alerts jsonb := '[]'::jsonb;
  wh uuid;
begin
  if p_direction not in ('out', 'in') then raise exception 'direction must be out or in' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then raise exception 'line list is not valid' using errcode = '22023'; end if;
  select id into dflt from public.warehouses where company_id = p_company and is_default and deleted_at is null;
  for l in
    select (e ->> 'productId')::uuid as product_id, nullif(e ->> 'variantId', '')::uuid as variant_id,
           nullif(e ->> 'warehouseId', '')::uuid as warehouse_id, (e ->> 'quantity')::numeric as quantity
      from jsonb_array_elements(p_lines) as e
     order by 1, 2, 3
  loop
    if l.quantity is null or l.quantity <= 0 then raise exception 'quantity must be above zero' using errcode = '22023'; end if;
    perform 1 from public.products where id = l.product_id and company_id = p_company and deleted_at is null and kind = 'product' and track_inventory;
    if not found then continue; end if;
    wh := coalesce(l.warehouse_id, dflt);
    if wh is null then raise exception 'the company has no warehouse' using errcode = '22023'; end if;
    n := n + 1;
    select * into r from public.kd_stock_move(
      p_company, l.product_id, l.variant_id, wh, case when p_direction = 'out' then -l.quantity else l.quantity end, null,
      p_kind, null, p_ref_type, p_ref_id, '', p_by, case when p_key is null then null else p_key || ':' || n end, null);
    if r.alert is not null then alerts := alerts || jsonb_build_array(jsonb_build_object('productId', l.product_id, 'state', r.alert)); end if;
  end loop;
  return alerts;
end
$$;
revoke all on function public.kd_stock_move_many(uuid, jsonb, text, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_stock_move_many(uuid, jsonb, text, text, text, uuid, uuid, text) to service_role;
