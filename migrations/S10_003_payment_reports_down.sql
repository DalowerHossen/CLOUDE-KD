-- path: migrations/S10_003_payment_reports_down.sql
drop function if exists public.kd_gateway_health(timestamptz);
drop function if exists public.kd_payment_report(uuid, timestamptz, timestamptz);
