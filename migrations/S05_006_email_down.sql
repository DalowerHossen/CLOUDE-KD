-- path: migrations/S05_006_email_down.sql
drop function if exists public.kd_email_unsubscribe(text);
drop function if exists public.kd_email_purge();
drop function if exists public.kd_email_setting_count(uuid, timestamptz);
drop function if exists public.kd_email_sent_count(uuid, timestamptz);
drop function if exists public.kd_email_track(text, text);
drop function if exists public.kd_email_event(text, text);
drop function if exists public.kd_email_result(uuid, text, text, text, text, timestamptz, uuid);
drop function if exists public.kd_email_claim(integer, uuid);
drop function if exists public.kd_email_enqueue(uuid, text, text, text, text, text, text, text, jsonb, boolean, text, timestamptz);
drop table if exists public.email_events;
drop table if exists public.email_suppressions;
drop table if exists public.email_outbox;
drop table if exists public.email_settings;
