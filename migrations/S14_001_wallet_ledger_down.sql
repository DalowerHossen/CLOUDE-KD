-- path: migrations/S14_001_wallet_ledger_down.sql
drop function if exists public.kd_wallet_verify();
drop function if exists public.kd_wallet_release_hold(uuid, uuid, uuid);
drop function if exists public.kd_wallet_post(uuid, text, text, text, uuid, jsonb, uuid, jsonb);
drop table if exists public.fee_schedules;
drop table if exists public.wallet_holds;
drop table if exists public.ledger_entries;
drop table if exists public.wallet_postings;
drop table if exists public.wallets;
drop function if exists public.kd_ledger_balanced();
drop function if exists public.kd_wallet_guard_balance();
