-- path: migrations/S16_011_migration_down.sql
drop function if exists public.kd_claim_migration_jobs(integer, integer);
drop table if exists public.migration_rows;
drop table if exists public.migration_jobs;
drop function if exists public.kd_migration_row_guard();
drop function if exists public.kd_migration_job_guard();
