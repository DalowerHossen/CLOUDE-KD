-- path: migrations/S15_004_report_views_down.sql
drop function if exists public.kd_ledger_monthly(uuid, date, date);
drop function if exists public.kd_ledger_balances(uuid, date, date, boolean);
drop index if exists public.ix_journal_lines_entry_date;
alter table public.accounts drop column if exists is_cash;
