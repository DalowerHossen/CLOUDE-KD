-- path: sql/assertions/s08_009_supplier_bills.sql
-- Supplier bills: three-way match, posting, remittances (allocation, idempotency, over-payment refused, cancel).
do $$
declare
  c uuid; w uuid; s uuid; p uuid; po uuid; pl uuid; b1 uuid; b2 uuid; b3 uuid; r jsonb; r2 jsonb; n integer;
begin
  insert into public.companies (name, slug) values ('Bill Co', 'bill-co') returning id into c;
  insert into public.warehouses (company_id, name, code, is_default) values (c, 'Main', 'MAIN', true) returning id into w;
  insert into public.suppliers (company_id, name) values (c, 'Bill Supplier') returning id into s;
  insert into public.products (company_id, name, track_inventory) values (c, 'Billed item', true) returning id into p;
  insert into public.purchase_orders (company_id, number, supplier_id, warehouse_id, status) values (c, 'PO-2026-0101', s, w, 'approved') returning id into po;
  insert into public.purchase_order_lines (company_id, purchase_order_id, position, product_id, quantity, unit_cost, line_total) values (c, po, 1, p, 10, 2, 20) returning id into pl;
  perform public.kd_po_receive(c, po, jsonb_build_array(jsonb_build_object('lineId', pl, 'quantity', 6)), null, 'GRN-2026-0101');

  insert into public.supplier_bills (company_id, number, supplier_id, purchase_order_id, bill_date, due_date, subtotal, total) values (c, 'BILL-2026-0001', s, po, current_date, current_date + 30, 16, 16) returning id into b1;
  insert into public.supplier_bill_lines (company_id, bill_id, position, po_line_id, product_id, quantity, unit_cost, line_total) values (c, b1, 1, pl, p, 8, 2, 16);
  r := public.kd_bill_post(c, b1, false);
  assert r ->> 'matchStatus' = 'mismatch' and (r ->> 'posted')::boolean = false, 'billed 8 but received 6 fails the match';
  assert (select status from public.supplier_bills where id = b1) = 'draft', 'a failed match stays a draft';
  r := public.kd_bill_post(c, b1, true);
  assert r ->> 'matchStatus' = 'overridden' and (select status from public.supplier_bills where id = b1) = 'open', 'override posts it';

  insert into public.supplier_bills (company_id, number, supplier_id, purchase_order_id, due_date, subtotal, total) values (c, 'BILL-2026-0002', s, po, current_date, 12, 12) returning id into b2;
  insert into public.supplier_bill_lines (company_id, bill_id, position, po_line_id, product_id, quantity, unit_cost, line_total) values (c, b2, 1, pl, p, 6, 2, 12);
  r := public.kd_bill_post(c, b2, false);
  assert r ->> 'matchStatus' = 'mismatch', 'earlier open bills count toward the billed quantity';
  update public.supplier_bills set status = 'void' where id = b1;
  r := public.kd_bill_post(c, b2, false);
  assert r ->> 'matchStatus' = 'matched', 'matches once the earlier bill is void';
  begin perform public.kd_bill_post(c, b2, false); assert false, 'only a draft can be posted';
  exception when sqlstate '22023' then null; end;

  insert into public.supplier_bills (company_id, number, supplier_id, due_date, subtotal, total) values (c, 'BILL-2026-0003', s, current_date, 50, 50) returning id into b3;
  insert into public.supplier_bill_lines (company_id, bill_id, position, description, quantity, unit_cost, line_total) values (c, b3, 1, 'Freight', 1, 50, 50);
  r := public.kd_bill_post(c, b3, false);
  assert r ->> 'matchStatus' = 'unmatched' and (r ->> 'posted')::boolean, 'a bill without an order posts as unmatched';
  begin insert into public.supplier_bill_lines (company_id, bill_id, position, quantity, unit_cost, line_total) values (c, b3, 2, 1, 1, 1); assert false, 'a line needs an item or a description';
  exception when check_violation then null; end;
  begin update public.supplier_bills set paid_total = 99 where id = b3; assert false, 'paid cannot exceed total';
  exception when check_violation then null; end;

  r := public.kd_supplier_remit(c, s, 30, current_date, 'bank_transfer', 'TR1', 'key-0000001', jsonb_build_array(jsonb_build_object('billId', b3, 'amount', 30)), null, 'RM-2026-0001');
  assert (select status from public.supplier_bills where id = b3) = 'partial' and (select paid_total from public.supplier_bills where id = b3) = 30, 'partial payment';
  r2 := public.kd_supplier_remit(c, s, 30, current_date, 'bank_transfer', 'TR1', 'key-0000001', jsonb_build_array(jsonb_build_object('billId', b3, 'amount', 30)), null, 'RM-2026-0002');
  assert (r2 ->> 'replayed')::boolean and r2 ->> 'id' = r ->> 'id', 'same key replays';
  assert (select paid_total from public.supplier_bills where id = b3) = 30, 'a replay changes nothing';
  begin perform public.kd_supplier_remit(c, s, 21, current_date, 'cash', '', 'key-0000002', jsonb_build_array(jsonb_build_object('billId', b3, 'amount', 21)), null, 'RM-2026-0003'); assert false, 'more than owed';
  exception when sqlstate '22023' then null; end;
  select count(*) into n from public.supplier_remittances where company_id = c;
  assert n = 1, 'a refused remittance leaves no row';
  begin perform public.kd_supplier_remit(c, s, 20, current_date, 'cash', '', 'key-0000003', jsonb_build_array(jsonb_build_object('billId', b3, 'amount', 10)), null, 'RM-2026-0004'); assert false, 'allocations must add up';
  exception when sqlstate '22023' then null; end;
  perform public.kd_supplier_remit(c, s, 20, current_date, 'cheque', '', 'key-0000004', jsonb_build_array(jsonb_build_object('billId', b3, 'amount', 20)), null, 'RM-2026-0005');
  assert (select status from public.supplier_bills where id = b3) = 'paid', 'fully paid';
  perform public.kd_supplier_remit_void(c, (r ->> 'id')::uuid);
  assert (select paid_total from public.supplier_bills where id = b3) = 20 and (select status from public.supplier_bills where id = b3) = 'partial', 'cancelling gives the money back';
  begin perform public.kd_supplier_remit_void(c, (r ->> 'id')::uuid); assert false, 'cancel twice';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_bill_post(gen_random_uuid(), b2, false); assert false, 'another company';
  exception when sqlstate '22023' then null; end;

end
$$;
