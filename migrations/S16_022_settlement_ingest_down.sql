-- path: migrations/S16_022_settlement_ingest_down.sql
drop table if exists public.settlement_ingest_keys;
drop function if exists public.kd_settlement_ingest_guard();
