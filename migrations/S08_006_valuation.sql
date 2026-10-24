-- path: migrations/S08_006_valuation.sql
-- STEP 08.6 (part A) Inventory valuation: cost layers (one per receipt, with batch and expiry), moving average cost,
-- the cost of every outflow (COGS) on the ledger, and the generic number counters. The stock function is extended; its
-- callers do not change.

alter table public.products add column if not exists valuation_method text not null default 'average' check (valuation_method in ('average', 'fifo', 'lifo'));
alter table public.stock_levels add column if not exists avg_cost numeric(18,4) not null default 0 check (avg_cost >= 0);
alter table public.stock_movements add column if not exists cost_total numeric(18,4) check (cost_total is null or cost_total >= 0);

create table if not exists public.stock_cost_layers (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  movement_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  qty_initial numeric(18,4) not null check (qty_initial > 0),
  qty_remaining numeric(18,4) not null check (qty_remaining >= 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  batch_no text check (batch_no is null or batch_no ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  expires_on date,
  expiry_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (qty_remaining <= qty_initial)
);

-- Which layers an outflow used, for the cost drill-down. Append only.
create table if not exists public.stock_layer_uses (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  movement_id uuid not null,
  layer_id uuid not null references public.stock_cost_layers (id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.number_counters (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  counter_key text not null check (counter_key ~ '^[A-Za-z0-9:_-]{1,40}$'),
  last_value bigint not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.stock_cost_layers');
select public.apply_standard_triggers('public.stock_layer_uses');
select public.apply_standard_triggers('public.number_counters');
select public.rls_enable_default_deny('public.stock_cost_layers');
select public.rls_enable_default_deny('public.stock_layer_uses');
select public.rls_enable_default_deny('public.number_counters');
select public.audit_enable_for('public.stock_cost_layers');
select public.audit_enable_for('public.stock_layer_uses');
select public.audit_enable_for('public.number_counters');
revoke all on public.stock_cost_layers, public.stock_layer_uses, public.number_counters from authenticated;
grant all on public.stock_cost_layers, public.stock_layer_uses, public.number_counters to service_role;

create index if not exists ix_layers_open on public.stock_cost_layers (company_id, product_id, warehouse_id, received_at) where deleted_at is null and qty_remaining > 0;
create index if not exists ix_layers_expiry on public.stock_cost_layers (company_id, expires_on) where deleted_at is null and qty_remaining > 0 and expires_on is not null;
create index if not exists ix_layer_uses_movement on public.stock_layer_uses (movement_id);
create unique index if not exists uq_number_counter on public.number_counters (company_id, counter_key) where deleted_at is null;

-- The next number of a counter, with no gaps or repeats even when many requests ask at once.
create or replace function public.kd_next_number(p_company uuid, p_key text) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare n bigint;
begin
  insert into public.number_counters (company_id, counter_key, last_value) values (p_company, p_key, 1)
  on conflict (company_id, counter_key) where deleted_at is null
  do update set last_value = public.number_counters.last_value + 1
  returning last_value into n;
  return n;
end
$$;
revoke all on function public.kd_next_number(uuid, text) from public, anon, authenticated;
grant execute on function public.kd_next_number(uuid, text) to service_role;

-- The full stock change with valuation. Same rules as before (locked row, never negative, idempotent key); in
-- addition a receipt makes a cost layer (with batch and expiry), an outflow uses layers in the order of the product's
-- method (average and first-in-first-out use the earliest expiry and then the oldest layer; last-in-first-out uses the
-- newest) and records its cost on the ledger. Under the average method the cost is the moving average of the warehouse.
-- p_source_movement: a transfer in copies the layers the transfer out used, so batch, expiry and cost travel along.
create or replace function public.kd_stock_apply(
  p_company uuid, p_product uuid, p_variant uuid, p_warehouse uuid, p_delta numeric, p_target numeric,
  p_kind text, p_reason text, p_ref_type text, p_ref_id uuid, p_note text, p_by uuid, p_key text, p_unit_cost numeric,
  p_batch text, p_expires date, p_source_movement uuid
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
  mv uuid := public.uuid_generate_v7();
  prior public.stock_movements%rowtype;
  cost numeric;
  total numeric := 0;
  remaining numeric;
  take numeric;
  layer record;
  src record;
  new_avg numeric;
  copied boolean := false;
  use_layers uuid[] := '{}';
  use_qty numeric[] := '{}';
  use_cost numeric[] := '{}';
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

  if delta > 0 then
    cost := coalesce(p_unit_cost, prod.cost_price);
    total := round(delta * cost, 4);
    insert into public.stock_movements (id, company_id, product_id, variant_id, warehouse_id, kind, quantity_delta, balance_after, unit_cost, cost_total, reason, reference_type, reference_id, note, idempotency_key, created_by)
    values (mv, p_company, p_product, p_variant, p_warehouse, p_kind, delta, new_qty, cost, total, p_reason, p_ref_type, p_ref_id, coalesce(p_note, ''), p_key, p_by);
    if p_source_movement is not null then
      for src in
        select u.quantity, u.unit_cost, l.batch_no, l.expires_on, l.received_at
          from public.stock_layer_uses u join public.stock_cost_layers l on l.id = u.layer_id
         where u.movement_id = p_source_movement and u.company_id = p_company
      loop
        insert into public.stock_cost_layers (company_id, product_id, variant_id, warehouse_id, movement_id, received_at, qty_initial, qty_remaining, unit_cost, batch_no, expires_on)
        values (p_company, p_product, p_variant, p_warehouse, mv, src.received_at, src.quantity, src.quantity, src.unit_cost, src.batch_no, src.expires_on);
        copied := true;
      end loop;
    end if;
    if not copied then
      insert into public.stock_cost_layers (company_id, product_id, variant_id, warehouse_id, movement_id, qty_initial, qty_remaining, unit_cost, batch_no, expires_on)
      values (p_company, p_product, p_variant, p_warehouse, mv, delta, delta, cost, p_batch, p_expires);
    end if;
    new_avg := case when new_qty = 0 then cost else round((old_qty * lvl.avg_cost + delta * cost) / new_qty, 4) end;
  else
    remaining := -delta;
    for layer in
      select * from public.stock_cost_layers
       where company_id = p_company and product_id = p_product and warehouse_id = p_warehouse
         and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_variant, '00000000-0000-0000-0000-000000000000'::uuid)
         and deleted_at is null and qty_remaining > 0
       order by case when prod.valuation_method = 'lifo' then null else coalesce(expires_on, 'infinity'::date) end asc nulls last,
                case when prod.valuation_method = 'lifo' then received_at end desc nulls last,
                case when prod.valuation_method = 'lifo' then id end desc nulls last,
                received_at asc, id asc
       for update
    loop
      exit when remaining <= 0;
      take := least(layer.qty_remaining, remaining);
      update public.stock_cost_layers set qty_remaining = qty_remaining - take where id = layer.id;
      total := total + take * layer.unit_cost;
      remaining := remaining - take;
      -- the use is recorded after the movement row exists (below)
      use_layers := array_append(use_layers, layer.id);
      use_qty := array_append(use_qty, take);
      use_cost := array_append(use_cost, layer.unit_cost);
    end loop;
    if remaining > 0 then
      -- stock that has no layer (it was there before valuation existed): valued at the average, else the item cost
      total := total + remaining * case when lvl.avg_cost > 0 then lvl.avg_cost else prod.cost_price end;
    end if;
    if prod.valuation_method = 'average' then
      total := (-delta) * case when lvl.avg_cost > 0 then lvl.avg_cost else (total / (-delta)) end;
    end if;
    total := round(total, 4);
    cost := round(total / (-delta), 4);
    new_avg := lvl.avg_cost;
    insert into public.stock_movements (id, company_id, product_id, variant_id, warehouse_id, kind, quantity_delta, balance_after, unit_cost, cost_total, reason, reference_type, reference_id, note, idempotency_key, created_by)
    values (mv, p_company, p_product, p_variant, p_warehouse, p_kind, delta, new_qty, cost, total, p_reason, p_ref_type, p_ref_id, coalesce(p_note, ''), p_key, p_by);
    if cardinality(use_layers) > 0 then
      insert into public.stock_layer_uses (company_id, movement_id, layer_id, quantity, unit_cost)
      select p_company, mv, a.layer_id, a.quantity, a.unit_cost from unnest(use_layers, use_qty, use_cost) as a(layer_id, quantity, unit_cost);
    end if;
  end if;

  state := case when new_qty = 0 then 'out' when prod.reorder_level is not null and new_qty <= prod.reorder_level then 'low' else 'ok' end;
  if state <> lvl.alert_state and state <> 'ok' then alert_out := state; end if;
  update public.stock_levels set quantity = new_qty, alert_state = state, avg_cost = new_avg where id = lvl.id;
  return query select mv, new_qty, alert_out, delta, false;
end
$$;

-- The old name keeps working: no batch, no expiry, no source movement.
create or replace function public.kd_stock_move(
  p_company uuid, p_product uuid, p_variant uuid, p_warehouse uuid, p_delta numeric, p_target numeric,
  p_kind text, p_reason text, p_ref_type text, p_ref_id uuid, p_note text, p_by uuid, p_key text, p_unit_cost numeric
) returns table (movement_id uuid, balance numeric, alert text, applied numeric, replay boolean)
language sql security definer
set search_path = public
as $$
  select * from public.kd_stock_apply(p_company, p_product, p_variant, p_warehouse, p_delta, p_target, p_kind, p_reason, p_ref_type, p_ref_id, p_note, p_by, p_key, p_unit_cost, null, null, null)
$$;

-- Transfers carry cost, batch and expiry to the other warehouse.
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
  unit numeric;
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
  select * into o from public.kd_stock_apply(p_company, p_product, p_variant, p_from, -p_qty, null, 'transfer_out', null, 'transfer', null, p_note, p_by, case when p_key is null then null else p_key || ':out' end, null, null, null, null);
  select unit_cost into unit from public.stock_movements where id = o.movement_id;
  select * into i from public.kd_stock_apply(p_company, p_product, p_variant, p_to, p_qty, null, 'transfer_in', null, 'transfer', null, p_note, p_by, case when p_key is null then null else p_key || ':in' end, unit, null, null, o.movement_id);
  return query select o.balance, i.balance;
end
$$;

-- Value of the stock: by method. Average uses quantity times the moving average; first and last in first out add up the
-- open layers. Returns one row per product, variant and warehouse that holds stock.
create or replace function public.kd_stock_valuation(p_company uuid) returns table (product_id uuid, variant_id uuid, warehouse_id uuid, quantity numeric, value numeric, method text)
language sql stable security definer
set search_path = public
as $$
  select l.product_id, l.variant_id, l.warehouse_id, l.quantity,
         case when p.valuation_method = 'average' then round(l.quantity * l.avg_cost, 4)
              else coalesce((select round(sum(c.qty_remaining * c.unit_cost), 4) from public.stock_cost_layers c
                              where c.warehouse_id = l.warehouse_id and c.product_id = l.product_id
                                and coalesce(c.variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(l.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                                and c.deleted_at is null and c.qty_remaining > 0), 0) end,
         p.valuation_method
    from public.stock_levels l join public.products p on p.id = l.product_id
   where l.company_id = p_company and l.deleted_at is null and l.quantity > 0
$$;
revoke all on function public.kd_stock_apply(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric, text, date, uuid),
  public.kd_stock_valuation(uuid) from public, anon, authenticated;
grant execute on function public.kd_stock_apply(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric, text, date, uuid),
  public.kd_stock_valuation(uuid) to service_role;
