-- path: migrations/S07_001_company_settings_down.sql
drop function if exists public.kd_milestone_record(uuid, text);
drop function if exists public.kd_company_setting_save(uuid, text, jsonb, integer, uuid);
drop table if exists public.company_milestones;
drop table if exists public.company_settings;
