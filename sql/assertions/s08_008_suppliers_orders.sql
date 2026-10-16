-- path: sql/assertions/s08_008_suppliers_orders.sql
-- Suppliers: search; purchase orders: numbers, receive against an order in parts, never over the order, stock added.
do $$
declare
  c uuid; c2 uuid; w uuid; s uuid; s2 uuid; p uuid; po uuid; l1 uuid; l2 uuid; r jsonb; q numeric; n integer;
begin
  insert into public.companies (name, slug) values ('Buy Co', 'buy-co') returning id into c;
  insert into public.companies (name, slug) values ('Buy Two', 'buy-two') returning id into c2;
  insert into public.warehouses (company_id, name, code, is_default) values (c, 'Main', 'MAIN', true) returning id into w;
  insert into public.suppliers (company_id, name, email, category) values (c, 'Acme Supply Ltd', 'sales@acme-supply.test', 'parts') returning id into s;
  insert into public.suppliers (company_id, name) values (c2, 'Acme Foreign') returning id into s2;
  begin insert into public.suppliers (company_id, name, email) values (c, 'Bad', 'not-an-email'); assert false, 'e-mail format';
  exception when check_violation then null; end;
  select count(*) into n from public.kd_supplier_search(c, 'acme sply', null, null, null, null, 25);
  assert n = 1, 'typo tolerant, own company only';
  select count(*) into n from public.kd_supplier_search(c, null, null, 'PARTS', null, null, 25);
  assert n = 1, 'category filter ignores case';

  insert into public.products (company_id, name, track_inventory) values (c, 'Ordered item', true) returning id into p;
  insert into public.purchase_orders (company_id, number, supplier_id, warehouse_id, status) values (c, 'PO-2026-0001', s, w, 'approved') returning id into po;
  begin insert into public.purchase_orders (company_id, number, supplier_id, warehouse_id) values (c, 'PO-2026-0001', s, w); assert false, 'number unique per company';
  exception when unique_violation then null; end;
  begin insert into public.purchase_orders (company_id, number, supplier_id, warehouse_id, expected_date) values (c, 'PO-2026-0002', s, w, current_date - 1); assert false, 'expected date not before the order date';
  exception when check_violation then null; end;
  insert into public.purchase_order_lines (company_id, purchase_order_id, position, product_id, quantity, unit_cost, line_total) values (c, po, 1, p, 10, 2.5, 25) returning id into l1;
  insert into public.purchase_order_lines (company_id, purchase_order_id, position, product_id, quantity, unit_cost, line_total) values (c, po, 2, p, 4, 3, 12) returning id into l2;
  begin update public.purchase_order_lines set received_qty = 11 where id = l1; assert false, 'received cannot exceed ordered';
  exception when check_violation then null; end;

  begin perform public.kd_po_receive(c2, po, jsonb_build_array(jsonb_build_object('lineId', l1, 'quantity', 1)), null, 'GRN-X'); assert false, 'another company cannot receive';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_po_receive(c, po, jsonb_build_array(jsonb_build_object('lineId', l1, 'quantity', 11)), null, 'GRN-X'); assert false, 'more than ordered';
  exception when sqlstate '22023' then null; end;
  assert (select received_qty from public.purchase_order_lines where id = l1) = 0, 'a refused receipt changes nothing';

  r := public.kd_po_receive(c, po, jsonb_build_array(jsonb_build_object('lineId', l1, 'quantity', 6, 'batchNo', 'LOT-9', 'expiresOn', '2028-01-31')), null, 'GRN-2026-0001');
  assert r ->> 'status' = 'partial', 'partly received';
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 6, 'stock added';
  assert exists (select 1 from public.stock_cost_layers where product_id = p and batch_no = 'LOT-9' and unit_cost = 2.5), 'cost and batch from the order';
  assert (select status from public.inventory_documents where number = 'GRN-2026-0001') = 'posted', 'a posted receipt document exists';
  assert (select reference from public.inventory_documents where number = 'GRN-2026-0001') = 'PO-2026-0001', 'the document points to the order';

  r := public.kd_po_receive(c, po, jsonb_build_array(jsonb_build_object('lineId', l1, 'quantity', 4), jsonb_build_object('lineId', l2, 'quantity', 4)), null, 'GRN-2026-0002');
  assert r ->> 'status' = 'received', 'fully received';
  assert (select status from public.purchase_orders where id = po) = 'received', 'order closed';
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 14, 'all stock added';
  begin perform public.kd_po_receive(c, po, jsonb_build_array(jsonb_build_object('lineId', l1, 'quantity', 1)), null, 'GRN-2026-0003'); assert false, 'a received order takes no more';
  exception when sqlstate '22023' then null; end;
  assert not has_table_privilege('authenticated', 'public.purchase_orders', 'select'), 'closed to clients';
end
$$;
