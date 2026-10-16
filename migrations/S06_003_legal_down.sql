-- path: migrations/S06_003_legal_down.sql
drop function if exists public.kd_legal_accept(text, uuid, text, text, text);
drop table if exists public.legal_acceptances;
drop function if exists public.legal_acceptance_guard();
