-- path: migrations/S08_005_inventory_down.sql
drop function if exists public.kd_stock_move_many(uuid, jsonb, text, text, text, uuid, uuid, text);
drop function if exists public.kd_stock_transfer(uuid, uuid, uuid, uuid, uuid, numeric, uuid, text, text);
drop function if exists public.kd_stock_move(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric);
drop trigger if exists trg_stock_movements_no_update on public.stock_movements;
drop function if exists public.kd_stock_ledger_guard();
drop table if exists public.stock_movements;
drop table if exists public.stock_levels;
drop table if exists public.warehouses;
alter table public.products drop column if exists reorder_level;
