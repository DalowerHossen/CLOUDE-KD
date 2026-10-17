-- path: migrations/S09_013_time_billing_down.sql
drop function if exists public.kd_time_release_stale();
drop function if exists public.kd_time_release(uuid, uuid, uuid[]);
drop function if exists public.kd_time_link(uuid, uuid[], uuid);
drop function if exists public.kd_time_claim(uuid, uuid[]);
