-- path: migrations/S14_006_subscriptions_down.sql
drop function if exists public.kd_platform_invoice_number(integer);
drop table if exists public.subscription_events;
drop table if exists public.platform_invoice_counters;
drop table if exists public.platform_invoice_items;
drop table if exists public.platform_invoices;
drop table if exists public.platform_subscriptions;
drop table if exists public.billing_settings;
