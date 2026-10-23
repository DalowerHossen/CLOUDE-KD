-- path: migrations/S14_008_client_subscriptions_down.sql
drop table if exists public.client_subscription_events;
drop table if exists public.client_billing_runs;
drop table if exists public.client_subscriptions;
drop table if exists public.client_subscription_plans;
