-- path: migrations/S16_015_bankfeed_down.sql
drop table if exists public.bank_feed_batches;
drop table if exists public.bank_feed_accounts;
drop table if exists public.bank_feed_connections;
drop function if exists public.kd_bank_feed_guard();
drop function if exists public.kd_bank_feed_child_guard();
