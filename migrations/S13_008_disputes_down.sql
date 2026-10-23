-- path: migrations/S13_008_disputes_down.sql
drop table if exists public.refund_requests;
drop table if exists public.dispute_events;
drop table if exists public.dispute_evidence;
drop table if exists public.disputes;
