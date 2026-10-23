-- path: migrations/S15_006_reconciliation_down.sql
drop function if exists public.kd_reconciliation_complete(uuid, uuid, uuid, text);
drop function if exists public.kd_reconciliation_state(uuid, uuid);
drop function if exists public.kd_reconciliation_start(uuid, uuid, date, numeric, uuid);
drop function if exists public.kd_bank_refresh_status(uuid);
drop table if exists public.bank_rules;
drop table if exists public.bank_matches;
drop table if exists public.bank_transactions;
drop table if exists public.reconciliations;
drop table if exists public.bank_imports;
drop table if exists public.bank_accounts;
drop function if exists public.kd_bank_match_guard();
drop function if exists public.kd_bank_transaction_guard();
drop function if exists public.kd_bank_account_guard();
