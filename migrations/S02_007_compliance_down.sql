-- path: migrations/S02_007_compliance_down.sql
drop function if exists public.kd_apply_retention_core();
drop function if exists public.kd_dsar_erase_profile(uuid, uuid);
drop table if exists public.data_classifications;
drop table if exists public.retention_policies;
drop table if exists public.dsar_requests;
drop table if exists public.consent_records_platform;
