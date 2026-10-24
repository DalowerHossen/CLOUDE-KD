-- path: migrations/S06_006_analytics_down.sql
drop function if exists public.kd_analytics_hit(text, text);
drop table if exists public.analytics_daily;
