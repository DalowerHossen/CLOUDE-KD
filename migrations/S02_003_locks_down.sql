-- path: migrations/S02_003_locks_down.sql
drop function if exists public.kd_update_with_version(text, uuid, integer, jsonb);
drop function if exists public.kd_release_lease(text, uuid);
drop function if exists public.kd_acquire_lease(text, uuid, integer, uuid);
drop table if exists public.lock_leases;
