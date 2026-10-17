-- path: migrations/S09_008_credits_down.sql
drop function if exists public.kd_credit_void(uuid, uuid, text, uuid);
drop function if exists public.kd_credit_apply(uuid, text, uuid, uuid, numeric, uuid);
drop function if exists public.kd_credit_issue(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid);
drop table if exists public.credit_applications;
drop table if exists public.credit_notes;
drop function if exists public.kd_credit_guard();
