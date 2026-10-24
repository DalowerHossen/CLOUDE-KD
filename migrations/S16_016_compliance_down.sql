-- path: migrations/S16_016_compliance_down.sql
drop function if exists public.kd_sanctions_replace(text, jsonb, uuid, text, boolean);
drop function if exists public.kd_sanctions_candidates(text[], integer);
drop table if exists public.sanctions_sources;
drop table if exists public.sanctions_entries;
drop table if exists public.country_restrictions;
