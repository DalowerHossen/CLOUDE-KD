-- path: migrations/S09_007_estimates_down.sql
drop function if exists public.kd_estimate_expire(date);
drop function if exists public.kd_estimate_decide(uuid, text, text, text, text, text, text);
drop function if exists public.kd_estimate_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid);
drop table if exists public.estimate_events;
drop table if exists public.estimates;
drop function if exists public.kd_estimate_guard();
