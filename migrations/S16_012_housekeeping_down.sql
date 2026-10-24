-- path: migrations/S16_012_housekeeping_down.sql
drop index if exists public.ix_api_keys_expiring;
alter table public.api_keys drop column if exists expiry_notice_at;
