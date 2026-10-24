-- path: migrations/S16_003_whatsapp_down.sql
drop table if exists public.whatsapp_messages;
drop table if exists public.whatsapp_contacts;
drop table if exists public.whatsapp_templates;
drop table if exists public.whatsapp_accounts;
drop function if exists public.kd_whatsapp_message_guard();
drop function if exists public.kd_whatsapp_template_guard();
drop function if exists public.kd_whatsapp_contact_guard();
