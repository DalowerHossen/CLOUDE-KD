-- path: migrations/S13_001_portal_core_down.sql
drop function if exists public.kd_portal_token_lookup(text);
drop table if exists public.link_requests;
drop table if exists public.portal_events;
