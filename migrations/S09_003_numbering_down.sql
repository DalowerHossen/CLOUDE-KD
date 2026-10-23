-- path: migrations/S09_003_numbering_down.sql
drop function if exists public.kd_peek_doc_number(uuid, text, integer, bigint);
drop function if exists public.kd_invoice_assign_number(uuid, uuid, text, boolean, integer, bigint, integer, text);
drop function if exists public.kd_next_doc_number(uuid, text, integer, bigint);
drop table if exists public.invoice_sequences;
