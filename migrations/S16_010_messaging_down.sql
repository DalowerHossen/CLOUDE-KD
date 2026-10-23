-- path: migrations/S16_010_messaging_down.sql
drop function if exists public.kd_claim_messages(integer);
drop table if exists public.messaging_messages;
drop table if exists public.messaging_variants;
drop table if exists public.messaging_campaigns;
drop table if exists public.messaging_client_prefs;
drop table if exists public.messaging_routes;
drop table if exists public.messaging_settings;
drop function if exists public.kd_messaging_campaign_guard();
drop function if exists public.kd_messaging_guard();
drop function if exists public.kd_unique_array(text[]);
