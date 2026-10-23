-- path: migrations/S13_005_contracts_down.sql
drop function if exists public.kd_contract_save(uuid, uuid, uuid, integer, jsonb, jsonb);
drop table if exists public.contract_events;
drop table if exists public.contract_signers;
drop table if exists public.contract_versions;
drop table if exists public.contracts;
drop table if exists public.contract_templates;
drop sequence if exists public.contract_number_seq;
