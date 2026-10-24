-- path: migrations/S15_010_payroll_people_down.sql
drop table if exists public.payroll_tax_brackets;
drop table if exists public.payroll_tax_rules;
drop table if exists public.employee_documents;
drop table if exists public.employees;
drop table if exists public.salary_structure_items;
drop table if exists public.salary_structures;
drop table if exists public.salary_components;
drop table if exists public.salary_grades;
drop table if exists public.payroll_settings;
drop function if exists public.kd_payroll_ref_guard();
drop function if exists public.kd_employee_number();
