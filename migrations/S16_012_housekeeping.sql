-- path: migrations/S16_012_housekeeping.sql
-- STEP 16.11 Housekeeping of the integrations: the expiry notice of an API key is sent once, so the time it was sent is kept.
alter table public.api_keys add column if not exists expiry_notice_at timestamptz;
create index if not exists ix_api_keys_expiring on public.api_keys (expires_at) where revoked_at is null and deleted_at is null and expires_at is not null and expiry_notice_at is null;
