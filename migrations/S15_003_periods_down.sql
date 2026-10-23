-- path: migrations/S15_003_periods_down.sql
drop trigger if exists trg_journal_entries_period on public.journal_entries;
drop function if exists public.kd_period_balances(uuid, date, date);
drop function if exists public.kd_period_reopen(uuid, uuid, uuid, text);
drop function if exists public.kd_period_close(uuid, uuid, uuid, text);
drop function if exists public.kd_period_guard();
drop function if exists public.kd_fiscal_year_create(uuid, date, text);
drop table if exists public.recurring_journals;
drop table if exists public.fiscal_periods;
drop table if exists public.fiscal_years;
drop table if exists public.accounting_settings;
drop function if exists public.kd_fiscal_year_guard();
