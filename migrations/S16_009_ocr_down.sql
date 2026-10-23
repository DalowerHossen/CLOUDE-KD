-- path: migrations/S16_009_ocr_down.sql
drop function if exists public.kd_claim_ocr_jobs(integer, integer);
drop table if exists public.ocr_jobs;
drop table if exists public.ocr_settings;
drop function if exists public.kd_ocr_job_guard();
