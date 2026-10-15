-- path: migrations/S02_006_events_jobs_down.sql
drop function if exists public.kd_purge_queues();
drop function if exists public.kd_finish_job(uuid, boolean, text);
drop function if exists public.kd_claim_jobs(integer, text, integer, text[]);
drop function if exists public.kd_enqueue_job(uuid, text, jsonb, timestamptz, integer, text);
drop function if exists public.kd_finish_event(uuid, boolean, text, integer);
drop function if exists public.kd_claim_events(integer, text, integer);
drop function if exists public.kd_publish_event(uuid, text, jsonb, text);
drop function if exists public.kd_backoff(integer);
drop table if exists public.api_idempotency;
drop table if exists public.job_queue;
drop table if exists public.domain_events;
