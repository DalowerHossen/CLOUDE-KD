-- path: sql/assertions/s08_006_valuation.sql
-- Valuation: layers, FIFO and LIFO and average cost, COGS on the ledger, expiry order, transfers carry cost, counters.
do $$
declare
  c uuid; w1 uuid; w2 uuid; pf uuid; pl uuid; pa uuid; r record; cost numeric; n bigint; v numeric;
begin
  insert into public.companies (name, slug) values ('Value Co', 'value-co') returning id into c;
  insert into public.warehouses (company_id, name, code, is_default) values (c, 'Main', 'MAIN', true) returning id into w1;
  insert into public.warehouses (company_id, name, code) values (c, 'Second', 'SEC') returning id into w2;
  insert into public.products (company_id, name, track_inventory, valuation_method, cost_price) values (c, 'Fifo item', true, 'fifo', 1) returning id into pf;
  insert into public.products (company_id, name, track_inventory, valuation_method, cost_price) values (c, 'Lifo item', true, 'lifo', 1) returning id into pl;
  insert into public.products (company_id, name, track_inventory, valuation_method, cost_price) values (c, 'Average item', true, 'average', 1) returning id into pa;

  -- the same two receipts for each item: 10 at 2.00, then 10 at 4.00
  perform public.kd_stock_move(c, pf, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 2);
  perform public.kd_stock_move(c, pf, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 4);
  perform public.kd_stock_move(c, pl, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 2);
  perform public.kd_stock_move(c, pl, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 4);
  perform public.kd_stock_move(c, pa, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 2);
  perform public.kd_stock_move(c, pa, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 4);
  assert (select avg_cost from public.stock_levels where product_id = pa) = 3, 'moving average of 10 at 2 and 10 at 4 is 3';

  -- sell 15
  perform public.kd_stock_move(c, pf, null, w1, -15, null, 'sale', null, null, null, '', null, null, null);
  perform public.kd_stock_move(c, pl, null, w1, -15, null, 'sale', null, null, null, '', null, null, null);
  perform public.kd_stock_move(c, pa, null, w1, -15, null, 'sale', null, null, null, '', null, null, null);
  select cost_total into cost from public.stock_movements where product_id = pf and kind = 'sale';
  assert cost = 40, 'FIFO: 10 x 2 + 5 x 4 = 40';
  select cost_total into cost from public.stock_movements where product_id = pl and kind = 'sale';
  assert cost = 50, 'LIFO: 10 x 4 + 5 x 2 = 50';
  select cost_total into cost from public.stock_movements where product_id = pa and kind = 'sale';
  assert cost = 45, 'average: 15 x 3 = 45';
  select value into v from public.kd_stock_valuation(c) where product_id = pf;
  assert v = 20, 'FIFO value of what is left: 5 x 4';
  select value into v from public.kd_stock_valuation(c) where product_id = pl;
  assert v = 10, 'LIFO value of what is left: 5 x 2';
  select value into v from public.kd_stock_valuation(c) where product_id = pa;
  assert v = 15, 'average value: 5 x 3';
  assert (select count(*) from public.stock_layer_uses u join public.stock_movements m on m.id = u.movement_id where m.product_id = pf) = 2, 'FIFO used two layers';

  -- expiry first: the layer that expires first goes first even though it came later
  perform public.kd_stock_apply(c, pf, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 5, 'B-LATE', current_date + 200, null);
  perform public.kd_stock_apply(c, pf, null, w1, 10, null, 'receipt', null, null, null, '', null, null, 6, 'B-SOON', current_date + 5, null);
  perform public.kd_stock_move(c, pf, null, w1, -10, null, 'sale', null, null, null, '', null, null, null);
  assert (select qty_remaining from public.stock_cost_layers where batch_no = 'B-SOON') = 0, 'the batch that expires first is used first';
  assert (select qty_remaining from public.stock_cost_layers where batch_no = 'B-LATE') = 10, 'the later batch is untouched';

  -- a transfer carries cost, batch and expiry
  select * into r from public.kd_stock_transfer(c, pf, null, w1, w2, 5, null, null, '');
  assert exists (select 1 from public.stock_cost_layers where warehouse_id = w2 and product_id = pf and unit_cost = 5 and batch_no = 'B-LATE' and qty_remaining = 5), 'cost, batch and expiry travel with the transfer';
  assert (select cost_total from public.stock_movements where product_id = pf and kind = 'transfer_in') = 25, 'transfer in is valued at the cost of what left';

  -- layers add up to the level
  assert (select sum(qty_remaining) from public.stock_cost_layers where product_id = pf and deleted_at is null) = (select sum(quantity) from public.stock_levels where product_id = pf), 'layers add up to the stock';
  begin update public.stock_movements set cost_total = 0 where product_id = pf; assert false, 'ledger stays append only';
  exception when sqlstate '42501' then null; end;

  -- counters never repeat
  n := public.kd_next_number(c, 'PO:2026');
  assert n = 1 and public.kd_next_number(c, 'PO:2026') = 2 and public.kd_next_number(c, 'GRN:2026') = 1, 'counters count per key';
end
$$;
