-- path: migrations/S08_001_clients_down.sql
drop function if exists public.kd_client_contacts_replace(uuid, uuid, jsonb);
drop table if exists public.custom_field_defs;
drop table if exists public.client_contacts;
drop table if exists public.clients;
