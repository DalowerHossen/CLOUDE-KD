-- path: migrations/S09_017_client_hooks_down.sql
drop trigger if exists trg_invoices_balance on public.invoices;
drop function if exists public.kd_invoice_merge_client(uuid, uuid, uuid);
drop function if exists public.kd_invoice_balance_trigger();
drop function if exists public.kd_sync_client_balance(uuid, uuid);
-- The three guards keep the merge allowance; the earlier migrations define their strict versions again when re-applied.
