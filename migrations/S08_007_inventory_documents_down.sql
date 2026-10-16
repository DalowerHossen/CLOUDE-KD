-- path: migrations/S08_007_inventory_documents_down.sql
drop function if exists public.kd_stock_count_complete(uuid, uuid, uuid);
drop function if exists public.kd_stock_count_start(uuid, uuid, text, uuid, text);
drop function if exists public.kd_inventory_document_post(uuid, uuid, uuid);
drop table if exists public.stock_count_lines;
drop table if exists public.stock_counts;
drop table if exists public.inventory_document_lines;
drop table if exists public.inventory_documents;
