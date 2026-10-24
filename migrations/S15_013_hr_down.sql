-- path: migrations/S15_013_hr_down.sql
drop table if exists public.performance_notes;
drop table if exists public.leave_requests;
drop table if exists public.leave_balances;
drop table if exists public.leave_types;
drop table if exists public.checklist_items;
drop table if exists public.checklists;
drop table if exists public.checklist_template_items;
drop table if exists public.checklist_templates;
alter table public.employees drop constraint if exists employees_manager_not_self;
drop trigger if exists trg_employees_hr_ref on public.employees;
alter table public.employees drop column if exists manager_id;
alter table public.employees drop column if exists position_id;
alter table public.employees drop column if exists department_id;
drop table if exists public.positions;
drop table if exists public.departments;
drop function if exists public.kd_leave_request_guard();
drop function if exists public.kd_checklist_done();
drop function if exists public.kd_hr_ref_guard();
