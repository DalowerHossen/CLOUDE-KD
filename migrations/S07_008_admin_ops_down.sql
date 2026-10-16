-- path: migrations/S07_008_admin_ops_down.sql
drop function if exists public.kd_admin_shifts_replace(uuid, jsonb);
drop table if exists public.platform_setup;
drop table if exists public.announcements;
drop table if exists public.admin_shifts;
