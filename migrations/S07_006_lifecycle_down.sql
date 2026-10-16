-- path: migrations/S07_006_lifecycle_down.sql
drop function if exists public.kd_data_request_claim(integer);
drop table if exists public.data_requests;
