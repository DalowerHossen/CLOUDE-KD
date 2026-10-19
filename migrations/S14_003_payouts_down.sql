-- path: migrations/S14_003_payouts_down.sql
drop table if exists public.payout_events;
drop table if exists public.payouts;
drop table if exists public.payout_settings;
drop table if exists public.payout_schedules;
drop table if exists public.payout_methods;
