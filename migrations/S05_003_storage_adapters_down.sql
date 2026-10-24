-- path: migrations/S05_003_storage_adapters_down.sql
drop function if exists public.kd_grant_purge();
drop function if exists public.kd_grant_redeem(text);
drop table if exists public.signed_url_grants;
drop table if exists public.file_access_log;
drop table if exists public.drive_connections;
alter table public.files drop column if exists purged_at;
