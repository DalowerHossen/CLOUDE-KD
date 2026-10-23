-- path: migrations/S09_002_invoices_core_down.sql
drop table if exists public.invoice_payment_links;
drop table if exists public.invoice_events;
drop table if exists public.invoice_revisions;
drop table if exists public.invoice_items;
drop table if exists public.invoices;
drop function if exists public.kd_invoice_append_only();
drop function if exists public.kd_invoice_item_guard();
drop function if exists public.kd_invoice_guard();
