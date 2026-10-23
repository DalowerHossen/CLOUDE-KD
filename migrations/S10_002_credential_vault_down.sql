-- path: migrations/S10_002_credential_vault_down.sql
drop function if exists public.kd_processor_set_environment(text, text, uuid, integer);
drop function if exists public.kd_processor_set_enabled(text, boolean, uuid, integer);
drop function if exists public.kd_processor_record_test(text, text, boolean, text, uuid);
drop function if exists public.kd_processor_save_credentials(text, text, text, text, integer, text[], jsonb, uuid, integer);
drop function if exists public.kd_processor_ensure(text, jsonb);
