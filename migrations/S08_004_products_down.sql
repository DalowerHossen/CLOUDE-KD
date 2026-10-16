-- path: migrations/S08_004_products_down.sql
drop function if exists public.kd_product_search(uuid, text, text, text, uuid, numeric, numeric, text, boolean, text, uuid, integer);
drop function if exists public.kd_product_duplicates(uuid, text, text, text, uuid);
drop function if exists public.kd_bundle_items_replace(uuid, uuid, jsonb);
drop trigger if exists trg_bundle_item_check on public.product_bundle_items;
drop function if exists public.kd_check_bundle_item();
drop table if exists public.client_prices;
drop table if exists public.product_bundle_items;
drop table if exists public.product_variants;
drop table if exists public.products;
drop table if exists public.product_categories;
