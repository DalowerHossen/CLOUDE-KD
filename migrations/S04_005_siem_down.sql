-- path: migrations/S04_005_siem_down.sql
drop function if exists public.kd_siem_open_finding(text, text, text, integer, timestamptz, timestamptz, jsonb, uuid);
drop function if exists public.kd_siem_ioc_hits(integer);
drop function if exists public.kd_siem_correlate(text[], text, integer, integer);
drop function if exists public.kd_siem_delivery_result(uuid, uuid, text);
drop function if exists public.kd_siem_fetch(uuid, text, integer);
drop function if exists public.kd_severity_rank(text);
drop table if exists public.siem_findings;
drop table if exists public.siem_iocs;
drop table if exists public.siem_destinations;
