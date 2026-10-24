-- path: sql/assertions/s08_005_inventory.sql
-- Stock: never negative, ledger append only, idempotent keys, adjust to a target, transfers, alerts, tenant isolation.
do $$
declare
  c uuid; c2 uuid; p uuid; svc uuid; v uuid; w1 uuid; w2 uuid; w3 uuid; wx uuid;
  r record; n integer; q numeric;
begin
  insert into public.companies (name, slug) values ('Stock Co', 'stock-co') returning id into c;
  insert into public.companies (name, slug) values ('Stock Two', 'stock-two') returning id into c2;
  insert into public.warehouses (company_id, name, code, is_default) values (c, 'Main', 'MAIN', true) returning id into w1;
  insert into public.warehouses (company_id, name, code) values (c, 'Second', 'SEC') returning id into w2;
  insert into public.warehouses (company_id, name, code) values (c2, 'Foreign', 'MAIN') returning id into wx;
  begin insert into public.warehouses (company_id, name, code, is_default) values (c, 'Other default', 'D2', true); assert false, 'one default warehouse';
  exception when unique_violation then null; end;
  begin insert into public.warehouses (company_id, name, code) values (c, 'Same code', 'main'); assert false, 'code unique per company';
  exception when unique_violation then null; end;
  insert into public.products (company_id, name, sku, track_inventory, reorder_level) values (c, 'Tracked', 'T-1', true, 5) returning id into p;
  insert into public.products (company_id, name, kind) values (c, 'Service', 'service') returning id into svc;
  insert into public.product_variants (company_id, product_id, name) values (c, p, 'Large') returning id into v;

  select * into r from public.kd_stock_move(c, p, null, w1, 10, null, 'receipt', null, null, null, 'first delivery', null, 'k-1', 4.5);
  assert r.balance = 10 and not r.replay, 'receipt adds';
  select * into r from public.kd_stock_move(c, p, null, w1, 10, null, 'receipt', null, null, null, 'first delivery', null, 'k-1', 4.5);
  assert r.replay and r.balance = 10, 'the same key again changes nothing';
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null;
  assert q = 10, 'replay did not add again';

  begin perform public.kd_stock_move(c, p, null, w1, -11, null, 'issue', null, null, null, '', null, null, null); assert false, 'cannot go below zero';
  exception when sqlstate 'KD001' then null; end;
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null;
  assert q = 10, 'a refused change keeps the quantity';

  select * into r from public.kd_stock_move(c, p, null, w1, -6, null, 'sale', null, 'invoice', gen_random_uuid(), '', null, null, null);
  assert r.balance = 4 and r.alert = 'low', 'low alert when the quantity reaches the reorder level';
  select * into r from public.kd_stock_move(c, p, null, w1, -1, null, 'sale', null, null, null, '', null, null, null);
  assert r.alert is null, 'no second alert in the same state';
  select * into r from public.kd_stock_move(c, p, null, w1, -3, null, 'sale', null, null, null, '', null, null, null);
  assert r.balance = 0 and r.alert = 'out', 'out of stock alert';
  select * into r from public.kd_stock_move(c, p, null, w1, 20, null, 'receipt', null, null, null, '', null, null, null);
  assert r.alert is null and (select alert_state from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null) = 'ok', 'state back to ok';

  select * into r from public.kd_stock_move(c, p, null, w1, null, 12, 'adjustment', 'correction', null, null, 'count result', null, null, null);
  assert r.balance = 12 and r.applied = -8, 'adjust to a target computes the change under the lock';
  select * into r from public.kd_stock_move(c, p, null, w1, null, 12, 'adjustment', 'correction', null, null, '', null, null, null);
  assert r.movement_id is null and r.applied = 0, 'nothing to change';

  select * into r from public.kd_stock_move(c, p, v, w2, 3, null, 'receipt', null, null, null, '', null, null, null);
  assert r.balance = 3, 'variant stock is separate';
  begin perform public.kd_stock_move(c, svc, null, w1, 1, null, 'receipt', null, null, null, '', null, null, null); assert false, 'services have no stock';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_stock_move(c, p, null, wx, 1, null, 'receipt', null, null, null, '', null, null, null); assert false, 'warehouse of another company';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_stock_move(c2, p, null, wx, 1, null, 'receipt', null, null, null, '', null, null, null); assert false, 'product of another company';
  exception when sqlstate '22023' then null; end;

  select * into r from public.kd_stock_transfer(c, p, null, w1, w2, 5, null, 'tr-1', 'rebalance');
  assert r.out_balance = 7 and r.in_balance = 5, 'transfer moves stock';
  begin perform public.kd_stock_transfer(c, p, null, w1, w2, 100, null, null, ''); assert false, 'transfer cannot overdraw';
  exception when sqlstate 'KD001' then null; end;
  assert (select quantity from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null) = 7, 'a refused transfer keeps both sides';
  begin perform public.kd_stock_transfer(c, p, null, w1, w1, 1, null, null, ''); assert false, 'two different warehouses';
  exception when sqlstate '22023' then null; end;

  -- many lines at once: all or nothing, untracked items skipped, default warehouse used
  perform public.kd_stock_move(c, p, null, w1, null, 10, 'adjustment', 'correction', null, null, '', null, null, null);
  perform public.kd_stock_move_many(c, jsonb_build_array(jsonb_build_object('productId', p, 'quantity', 4), jsonb_build_object('productId', svc, 'quantity', 99)), 'out', 'sale', 'invoice', gen_random_uuid(), null, 'inv-1');
  assert (select quantity from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null) = 6, 'tracked line applied, service skipped, default warehouse used';
  begin perform public.kd_stock_move_many(c, jsonb_build_array(jsonb_build_object('productId', p, 'quantity', 2), jsonb_build_object('productId', p, 'variantId', v, 'warehouseId', w2, 'quantity', 50)), 'out', 'sale', null, null, null, null); assert false, 'a line that cannot be met stops everything';
  exception when sqlstate 'KD001' then null; end;
  assert (select quantity from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null) = 6, 'nothing was taken';
  perform public.kd_stock_move_many(c, jsonb_build_array(jsonb_build_object('productId', p, 'quantity', 4)), 'in', 'return_in', 'invoice', null, null, 'inv-1-void');
  assert (select quantity from public.stock_levels where product_id = p and warehouse_id = w1 and variant_id is null) = 10, 'stock returned';

  select count(*) into n from public.stock_movements where company_id = c;
  assert n > 8, 'every change is in the ledger';
  begin update public.stock_movements set quantity_delta = 1 where company_id = c; assert false, 'ledger is append only';
  exception when sqlstate '42501' then null; end;
  begin delete from public.stock_movements where company_id = c; assert false, 'ledger rows cannot be deleted';
  exception when sqlstate '42501' then null; end;
  assert (select sum(quantity_delta) from public.stock_movements where company_id = c and product_id = p and variant_id is null) = (select sum(quantity) from public.stock_levels where company_id = c and product_id = p and variant_id is null), 'ledger adds up to the levels';
  assert not has_table_privilege('authenticated', 'public.stock_levels', 'select'), 'closed to clients';
end
$$;
