-- path: migrations/S09_014_dashboard_down.sql
drop function if exists public.kd_dashboard_series(uuid, date, integer);
drop function if exists public.kd_dashboard_stats(uuid, date, date, date);
drop table if exists public.dashboard_layouts;
