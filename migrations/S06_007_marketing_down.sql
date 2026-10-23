-- path: migrations/S06_007_marketing_down.sql
drop function if exists public.kd_ab_count(text, text, text);
drop table if exists public.ab_stats;
drop table if exists public.ab_experiments;
drop table if exists public.campaigns;
drop table if exists public.leads;
drop table if exists public.testimonials;
