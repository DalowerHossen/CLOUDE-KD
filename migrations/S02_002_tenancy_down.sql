-- path: migrations/S02_002_tenancy_down.sql
drop table if exists public.feature_flags;
drop table if exists public.role_permissions;
drop table if exists public.roles;
drop table if exists public.memberships;
drop table if exists public.profiles;
drop trigger if exists trg_companies_tenant on public.companies;
drop function if exists public.companies_set_tenant();
drop table if exists public.companies;
drop function if exists public.app_is_super_admin();
drop function if exists public.app_is_platform();
drop function if exists public.app_role();
drop function if exists public.app_company_id();
drop function if exists public.app_claim(text);
