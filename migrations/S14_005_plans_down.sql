-- path: migrations/S14_005_plans_down.sql
drop function if exists public.kd_usage_add(uuid, text, text, bigint, bigint, boolean);
drop table if exists public.usage_counters;
drop table if exists public.plan_history;
drop table if exists public.plan_entitlements;
drop table if exists public.plans;
