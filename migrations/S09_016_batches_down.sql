-- path: migrations/S09_016_batches_down.sql
drop function if exists public.kd_batch_retry(uuid, uuid);
drop function if exists public.kd_batch_cancel(uuid, uuid);
drop function if exists public.kd_batch_item_result(uuid, text, text, uuid);
drop function if exists public.kd_batch_claim(integer);
drop table if exists public.invoice_batch_items;
drop table if exists public.invoice_batches;
