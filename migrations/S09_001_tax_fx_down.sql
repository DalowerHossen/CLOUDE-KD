-- path: migrations/S09_001_tax_fx_down.sql
drop function if exists public.kd_fx_rate(uuid, text, date);
drop table if exists public.fx_rates;
drop table if exists public.client_tax_exemptions;
drop table if exists public.tax_settings;
drop table if exists public.tax_rates;
