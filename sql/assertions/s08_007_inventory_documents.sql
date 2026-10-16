-- path: sql/assertions/s08_007_inventory_documents.sql
-- Documents post stock all or nothing; a posted document cannot be posted again; counts set counted quantities.
do $$
declare
  c uuid; c2 uuid; w uuid; p uuid; p2 uuid; d uuid; d2 uuid; cnt uuid; q numeric; alerts jsonb;
begin
  insert into public.companies (name, slug) values ('Docs Co', 'docs-co') returning id into c;
  insert into public.companies (name, slug) values ('Docs Two', 'docs-two') returning id into c2;
  insert into public.warehouses (company_id, name, code, is_default) values (c, 'Main', 'MAIN', true) returning id into w;
  insert into public.products (company_id, name, track_inventory, reorder_level) values (c, 'Doc item', true, 3) returning id into p;
  insert into public.products (company_id, name, track_inventory) values (c, 'Doc item two', true) returning id into p2;

  insert into public.inventory_documents (company_id, kind, number, warehouse_id, party_type, party_name) values (c, 'receipt', 'GRN-2026-0001', w, 'supplier', 'Acme Supply') returning id into d;
  insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity, unit_cost, batch_no, expires_on) values (c, d, 1, p, 20, 2.5, 'LOT-1', current_date + 90);
  insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d, 2, p2, 5);
  begin insert into public.inventory_documents (company_id, kind, number, warehouse_id) values (c, 'receipt', 'GRN-2026-0001', w); assert false, 'number unique per company';
  exception when unique_violation then null; end;
  begin insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d, 1, p, 1); assert false, 'one line per position';
  exception when unique_violation then null; end;
  begin insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d, 3, p, 0); assert false, 'quantity above zero';
  exception when check_violation then null; end;
  begin perform public.kd_inventory_document_post(c2, d, null); assert false, 'another company cannot post';
  exception when sqlstate '22023' then null; end;

  perform public.kd_inventory_document_post(c, d, null);
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 20, 'receipt added the stock';
  assert (select status from public.inventory_documents where id = d) = 'posted', 'posted';
  assert exists (select 1 from public.stock_cost_layers where product_id = p and batch_no = 'LOT-1' and unit_cost = 2.5), 'batch and cost kept';
  begin perform public.kd_inventory_document_post(c, d, null); assert false, 'a document is posted once';
  exception when sqlstate '22023' then null; end;

  -- issue that cannot be met: nothing changes
  insert into public.inventory_documents (company_id, kind, number, warehouse_id) values (c, 'issue', 'ISS-2026-0001', w) returning id into d2;
  insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d2, 1, p, 5);
  insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d2, 2, p2, 99);
  begin perform public.kd_inventory_document_post(c, d2, null); assert false, 'a short line stops the issue';
  exception when sqlstate 'KD001' then null; end;
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 20 and (select status from public.inventory_documents where id = d2) = 'draft', 'nothing changed and the document is still a draft';
  update public.inventory_document_lines set quantity = 3 where document_id = d2 and position = 2;
  alerts := public.kd_inventory_document_post(c, d2, null);
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 15, 'issue took the stock';
  assert (select cost_total from public.stock_movements where reference_id = d2 and product_id = p) = 12.5, 'issue carries the cost of what left';

  -- packing slip: no stock effect
  insert into public.inventory_documents (company_id, kind, number, warehouse_id) values (c, 'packing_slip', 'PS-2026-0001', w) returning id into d2;
  insert into public.inventory_document_lines (company_id, document_id, position, product_id, quantity) values (c, d2, 1, p, 100);
  perform public.kd_inventory_document_post(c, d2, null);
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 15, 'a packing slip does not move stock';
  begin perform public.kd_inventory_document_post(c, gen_random_uuid(), null); assert false, 'unknown document';
  exception when sqlstate '22023' then null; end;

  -- count
  cnt := public.kd_stock_count_start(c, w, 'CNT-2026-0001', null, 'yearly');
  assert (select count(*) from public.stock_count_lines where count_id = cnt) = 2, 'every tracked level is a line';
  begin perform public.kd_stock_count_start(c, w, 'CNT-2026-0002', null, ''); assert false, 'one open count per warehouse';
  exception when unique_violation then null; end;
  update public.stock_count_lines set counted_qty = 12 where count_id = cnt and product_id = p;
  perform public.kd_stock_move(c, p, null, w, -1, null, 'sale', null, null, null, '', null, null, null);
  alerts := public.kd_stock_count_complete(c, cnt, null);
  select quantity into q from public.stock_levels where product_id = p and warehouse_id = w;
  assert q = 12, 'the counted quantity became the stock, even after a sale during the count';
  assert (select quantity from public.stock_levels where product_id = p2 and warehouse_id = w) = 2, 'uncounted lines are left alone';
  assert (select status from public.stock_counts where id = cnt) = 'completed', 'completed';
  begin perform public.kd_stock_count_complete(c, cnt, null); assert false, 'complete once';
  exception when sqlstate '22023' then null; end;
  assert not has_table_privilege('authenticated', 'public.inventory_documents', 'select'), 'closed to clients';
end
$$;
