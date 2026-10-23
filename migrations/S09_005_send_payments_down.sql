-- path: migrations/S09_005_send_payments_down.sql
drop function if exists public.kd_invoice_mark_overdue(date);
drop function if exists public.kd_invoice_apply_payment(uuid, uuid, numeric);
drop function if exists public.kd_invoice_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid, uuid);
alter table public.tax_settings drop column if exists remit_to_enc;
