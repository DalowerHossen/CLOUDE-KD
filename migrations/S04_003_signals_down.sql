-- path: migrations/S04_003_signals_down.sql
drop function if exists public.kd_signal_count(text, text, text, integer);
drop function if exists public.kd_actor_actions(uuid, integer);
drop function if exists public.kd_last_country(uuid);
drop function if exists public.kd_signups_for_ip(text, integer);
drop function if exists public.kd_users_for_ip(text, integer);
drop function if exists public.kd_device_seen(uuid, uuid, text, text, text, text);
drop function if exists public.kd_risk_clear(text, text);
drop function if exists public.kd_risk_get(text, text);
drop function if exists public.kd_risk_add(text, text, text, integer, uuid, jsonb);
drop function if exists public.kd_risk_effective(numeric, timestamptz);
drop table if exists public.risk_scores;
drop table if exists public.fraud_signals;
drop table if exists public.device_fingerprints;
