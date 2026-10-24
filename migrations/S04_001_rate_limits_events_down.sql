-- path: migrations/S04_001_rate_limits_events_down.sql
drop function if exists public.kd_idempotency_release(text, text);
drop function if exists public.kd_idempotency_complete(text, text, integer, text, text);
drop function if exists public.kd_idempotency_begin(text, text, text, uuid, integer);
drop function if exists public.kd_rate_limit_purge();
drop function if exists public.kd_security_event(uuid, text, text, text, uuid, text, text, jsonb, text);
drop function if exists public.kd_ip_unblock(text);
drop function if exists public.kd_ip_is_blocked(text);
drop function if exists public.kd_ip_block(text, text, text, integer, boolean, uuid);
drop function if exists public.kd_rate_limit_hit(text, integer, integer);
drop table if exists public.security_events;
drop table if exists public.ip_blocks;
drop table if exists public.rate_limits;
