-- path: migrations/S16_002_webhooks_out_down.sql
drop function if exists public.kd_claim_webhook_deliveries(integer, integer);
drop table if exists public.webhook_delivery_attempts;
drop table if exists public.webhook_deliveries;
drop table if exists public.webhook_endpoints;
drop function if exists public.kd_webhook_attempt_guard();
drop function if exists public.kd_webhook_delivery_guard();
