-- path: migrations/S16_033_platform_controls_down.sql
drop table if exists public.tenant_rate_limits;
drop table if exists public.kill_switches;
drop table if exists public.platform_controls;
