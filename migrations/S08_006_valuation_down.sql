-- path: migrations/S08_006_valuation_down.sql
-- Rolling back restores the plain stock functions of S08_005 by re-running that file; the cost data is removed.
drop function if exists public.kd_stock_valuation(uuid);
drop function if exists public.kd_stock_apply(uuid, uuid, uuid, uuid, numeric, numeric, text, text, text, uuid, text, uuid, text, numeric, text, date, uuid);
drop function if exists public.kd_next_number(uuid, text);
drop table if exists public.number_counters;
drop table if exists public.stock_layer_uses;
drop table if exists public.stock_cost_layers;
alter table public.stock_movements drop column if exists cost_total;
alter table public.stock_levels drop column if exists avg_cost;
alter table public.products drop column if exists valuation_method;
