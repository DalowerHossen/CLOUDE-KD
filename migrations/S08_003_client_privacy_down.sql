-- path: migrations/S08_003_client_privacy_down.sql
drop function if exists public.kd_client_anonymize(uuid, uuid, boolean, uuid);
drop table if exists public.client_privacy_requests;
alter table public.clients drop column if exists contact_preference;
alter table public.clients drop column if exists consent_updated_at;
alter table public.clients drop column if exists marketing_consent;
