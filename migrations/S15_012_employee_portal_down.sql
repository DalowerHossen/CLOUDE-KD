-- path: migrations/S15_012_employee_portal_down.sql
drop table if exists public.employee_declarations;
drop table if exists public.employee_portal_links;
drop function if exists public.kd_employee_portal_guard();
drop function if exists public.kd_employee_declaration_guard();
drop function if exists public.kd_employee_link_guard();
