-- path: migrations/S09_011_dunning_down.sql
drop function if exists public.kd_invoice_writeoff(uuid, uuid, numeric, text, uuid);
alter table public.credit_applications drop constraint if exists credit_applications_source_type_check;
alter table public.credit_applications add constraint credit_applications_source_type_check check (source_type in ('credit_note', 'deposit'));
drop table if exists public.invoice_writeoffs;
drop table if exists public.late_fees;
drop table if exists public.late_fee_settings;
drop table if exists public.reminder_holds;
drop table if exists public.reminder_log;
drop table if exists public.reminder_settings;
