-- path: migrations/S16_001_api_keys_down.sql
drop function if exists public.kd_api_key_usage_add(uuid, uuid, date, boolean);
drop function if exists public.kd_api_key_hit(uuid, uuid, timestamptz);
drop table if exists public.api_sandbox_records;
drop table if exists public.api_key_usage;
drop table if exists public.api_key_windows;
drop table if exists public.api_keys;
drop function if exists public.kd_api_key_guard();
