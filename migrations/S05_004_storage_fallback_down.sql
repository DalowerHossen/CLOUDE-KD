-- path: migrations/S05_004_storage_fallback_down.sql
drop function if exists public.kd_drive_claim_fallback_notice(uuid);
alter table public.drive_connections drop column if exists last_fallback_notified_at;
