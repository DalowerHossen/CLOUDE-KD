-- path: migrations/S16_014_commerce_down.sql
drop table if exists public.integration_conflicts;
drop table if exists public.integration_mappings;
drop table if exists public.integration_sync_log;
drop table if exists public.integration_webhook_events;
drop table if exists public.integration_orders;
drop table if exists public.integrations;
drop function if exists public.kd_integration_order_guard();
drop function if exists public.kd_integration_guard();
drop function if exists public.kd_integration_append_only();
drop function if exists public.kd_integration_child_guard();
