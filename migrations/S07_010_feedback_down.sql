-- path: migrations/S07_010_feedback_down.sql
drop function if exists public.kd_feedback_dismissed(uuid, uuid, integer);
drop function if exists public.kd_feedback_answered(uuid, uuid);
drop table if exists public.feedback_prompts;
drop table if exists public.feedback_entries;
