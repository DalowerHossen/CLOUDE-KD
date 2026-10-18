-- path: migrations/S13_006_signatures_down.sql
drop function if exists public.kd_contract_decline(uuid, uuid, text);
drop function if exists public.kd_contract_sign(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid);
alter table public.contracts drop column if exists seal;
alter table public.contracts drop column if exists archive_hash;
drop table if exists public.signatures;
