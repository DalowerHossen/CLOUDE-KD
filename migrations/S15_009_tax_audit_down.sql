-- path: migrations/S15_009_tax_audit_down.sql
drop table if exists public.audit_packs;
drop table if exists public.tax_deadlines;
drop table if exists public.tax_payments;
drop table if exists public.tax_filing_settings;
drop function if exists public.kd_tax_deadline_guard();
