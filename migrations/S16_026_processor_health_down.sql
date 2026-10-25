-- path: migrations/S16_026_processor_health_down.sql
drop function if exists public.kd_processor_auto_disable(text, text);
drop table if exists public.processor_health_state;
drop table if exists public.processor_health;
