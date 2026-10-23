-- path: migrations/S09_012_projects_down.sql
drop table if exists public.time_entries;
drop table if exists public.project_milestones;
drop table if exists public.project_members;
alter table public.invoices drop constraint if exists fk_invoices_project;
drop table if exists public.projects;
drop table if exists public.time_settings;
drop function if exists public.kd_time_guard();
