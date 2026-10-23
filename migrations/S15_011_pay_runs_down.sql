-- path: migrations/S15_011_pay_runs_down.sql
drop table if exists public.pay_run_items;
drop table if exists public.pay_runs;
drop function if exists public.kd_pay_run_item_guard();
drop function if exists public.kd_pay_run_guard();
drop function if exists public.kd_pay_run_number();
