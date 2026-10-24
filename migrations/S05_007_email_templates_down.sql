-- path: migrations/S05_007_email_templates_down.sql
drop function if exists public.kd_template_restore(uuid, text, integer, uuid);
drop function if exists public.kd_template_reset(uuid, text);
drop function if exists public.kd_template_save(uuid, text, text, text, text, uuid);
drop table if exists public.email_template_overrides;
