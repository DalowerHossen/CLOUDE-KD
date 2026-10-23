-- path: migrations/S04_004_tokens_down.sql
drop function if exists public.kd_token_revoke(uuid);
drop function if exists public.kd_token_otp_check(uuid, text);
drop function if exists public.kd_token_otp_set(uuid, text, integer);
drop function if exists public.kd_token_touch(uuid, text);
drop function if exists public.kd_token_event(uuid, uuid, text, text, jsonb);
drop table if exists public.token_events;
drop table if exists public.access_tokens;
