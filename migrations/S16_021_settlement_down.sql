-- path: migrations/S16_021_settlement_down.sql
drop function if exists public.kd_settlement_entries_text(uuid, uuid, integer, timestamptz);
drop function if exists public.kd_settlement_record_payout(uuid, uuid, numeric, text, text, timestamptz, uuid, numeric);
drop function if exists public.kd_settlement_balance(uuid, uuid, timestamptz);
drop table if exists public.settlement_payouts;
drop table if exists public.settlement_entries;
drop table if exists public.settlement_terms;
drop function if exists public.kd_settlement_entries_append();
drop function if exists public.kd_settlement_guard();
