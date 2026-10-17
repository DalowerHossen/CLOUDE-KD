-- path: migrations/S09_004_invoice_search_down.sql
drop function if exists public.kd_invoice_search(uuid, text, text[], text, uuid, date, date, numeric, numeric, boolean, text, boolean, text, uuid, integer);
drop index if exists public.ix_invoices_number_trgm;
drop index if exists public.ix_invoices_issue;
