-- path: sql/assertions/s08_004_products.sql
-- Products: SKU and barcode unique per company, price checks, bundles hold plain items only, client prices.
do $$
declare
  c uuid; c2 uuid; a uuid; b uuid; s uuid; bun uuid; k uuid; n integer;
begin
  insert into public.companies (name, slug) values ('Catalog Co', 'catalog-co') returning id into c;
  insert into public.companies (name, slug) values ('Catalog Two', 'catalog-two') returning id into c2;
  insert into public.products (company_id, name, sku, unit_price, barcode, track_inventory) values (c, 'Blue Widget', 'BW-1', 12.5, '4006381333931', true) returning id into a;
  insert into public.products (company_id, name, sku, kind) values (c, 'Consulting hour', 'CON-1', 'service') returning id into s;
  insert into public.products (company_id, name, kind) values (c, 'Starter kit', 'bundle') returning id into bun;
  insert into public.products (company_id, name, sku) values (c2, 'Other Widget', 'BW-1') returning id into b;
  begin insert into public.products (company_id, name, sku) values (c, 'Dup', 'bw-1'); assert false, 'sku unique per company, any case';
  exception when unique_violation then null; end;
  begin insert into public.products (company_id, name, barcode) values (c, 'Dup code', '4006381333931'); assert false, 'barcode unique';
  exception when unique_violation then null; end;
  begin insert into public.products (company_id, name, unit_price) values (c, 'Negative', -1); assert false, 'price not negative';
  exception when check_violation then null; end;
  begin insert into public.products (company_id, name, tax_rate) values (c, 'Taxed', 120); assert false, 'rate is a percentage';
  exception when check_violation then null; end;
  begin insert into public.products (company_id, name, kind, track_inventory) values (c, 'Tracked service', 'service', true); assert false, 'services have no stock';
  exception when check_violation then null; end;
  begin insert into public.products (company_id, name, sku) values (c, 'Bad sku', '-bad'); assert false, 'sku shape';
  exception when check_violation then null; end;

  n := public.kd_bundle_items_replace(c, bun, jsonb_build_array(jsonb_build_object('productId', a, 'quantity', 2), jsonb_build_object('productId', s, 'quantity', 1.5)));
  assert n = 2, 'bundle items saved';
  begin perform public.kd_bundle_items_replace(c, a, '[]'::jsonb); assert false, 'only a bundle has items';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_bundle_items_replace(c, bun, jsonb_build_array(jsonb_build_object('productId', bun, 'quantity', 1))); assert false, 'a bundle cannot hold itself';
  exception when sqlstate '22023' or check_violation then null; end;
  begin perform public.kd_bundle_items_replace(c, bun, jsonb_build_array(jsonb_build_object('productId', b, 'quantity', 1))); assert false, 'item of another company';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_bundle_items_replace(c2, bun, '[]'::jsonb); assert false, 'another company cannot change the bundle';
  exception when sqlstate '22023' then null; end;
  assert (select count(*) from public.product_bundle_items where bundle_id = bun and deleted_at is null) = 2, 'a refused replace keeps the items';

  insert into public.product_variants (company_id, product_id, name, sku) values (c, a, 'Blue / Large', 'BW-1-L');
  begin insert into public.product_variants (company_id, product_id, name, sku) values (c, a, 'Other', 'bw-1-l'); assert false, 'variant sku unique';
  exception when unique_violation then null; end;

  insert into public.clients (company_id, name) values (c, 'Price Client') returning id into k;
  insert into public.client_prices (company_id, client_id, product_id, unit_price) values (c, k, a, 10);
  begin insert into public.client_prices (company_id, client_id, product_id, unit_price) values (c, k, a, 9); assert false, 'one price per client and product';
  exception when unique_violation then null; end;

  select count(*) into n from public.kd_product_duplicates(c, 'Blue Widgets', 'BW-1', null, null);
  assert n >= 1, 'duplicate by sku';
  select count(*) into n from public.kd_product_duplicates(c, 'Blue Widgets', null, null, a);
  assert n = 0, 'the product itself is excluded';
  select count(*) into n from public.kd_product_search(c, 'blue widgt', null, null, null, null, null, 'name', false, null, null, 25);
  assert n = 1, 'typo tolerant search finds the widget';
  select count(*) into n from public.kd_product_search(c, 'bw-1', null, null, null, null, null, 'name', false, null, null, 25);
  assert n = 1, 'search by sku';
  select count(*) into n from public.kd_product_search(c, null, null, 'service', null, null, null, 'name', false, null, null, 25);
  assert n = 1, 'kind filter';
  select count(*) into n from public.kd_product_search(c, null, null, null, null, 10, 20, 'price', true, null, null, 25);
  assert n = 1, 'price range filter';
  select count(*) into n from public.kd_product_search(c, null, null, null, null, null, null, 'name', false, null, null, 25);
  assert n = 3, 'other company never listed';
  assert not has_table_privilege('authenticated', 'public.products', 'select'), 'closed to clients';
end
$$;
