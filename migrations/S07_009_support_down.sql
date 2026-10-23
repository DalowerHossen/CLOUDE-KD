-- path: migrations/S07_009_support_down.sql
drop table if exists public.support_messages;
drop table if exists public.support_tickets;
drop sequence if exists public.support_ticket_seq;
