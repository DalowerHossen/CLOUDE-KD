-- path: migrations/S04_002_network_intel_down.sql
drop function if exists public.kd_whitelist_add(text, text, uuid);
drop function if exists public.kd_reputation_purge();
drop function if exists public.kd_tor_replace(text[], integer);
drop function if exists public.kd_reputation_put(text, integer, jsonb, text, text, integer);
drop function if exists public.kd_reputation_get(text);
drop function if exists public.kd_network_whitelisted(text);
drop table if exists public.ip_reputation;
