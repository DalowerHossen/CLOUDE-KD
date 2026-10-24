-- path: migrations/S10_001_payment_core_down.sql
drop function if exists public.kd_card_stats(uuid, text, uuid, integer, integer, integer);
drop function if exists public.kd_processor_switch_mode(text, text, uuid, integer);
drop table if exists public.payment_reviews;
drop table if exists public.webhook_events;
drop table if exists public.payment_links;
drop table if exists public.refunds;
drop table if exists public.payment_allocations;
drop table if exists public.payment_attempts;
drop table if exists public.payments;
drop table if exists public.card_blacklist;
drop table if exists public.card_identities;
drop table if exists public.routing_rules;
drop table if exists public.processor_mode_tests;
drop table if exists public.processor_modes;
drop table if exists public.processor_credentials;
drop table if exists public.processors;
drop function if exists public.kd_payment_guard();
drop function if exists public.kd_credentials_guard();
