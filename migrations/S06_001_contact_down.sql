-- path: migrations/S06_001_contact_down.sql
drop function if exists public.kd_contact_purge();
drop table if exists public.contact_messages;
