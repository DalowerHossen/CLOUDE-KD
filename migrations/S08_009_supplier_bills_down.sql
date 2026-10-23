-- path: migrations/S08_009_supplier_bills_down.sql
drop function if exists public.kd_supplier_remit_void(uuid, uuid);
drop function if exists public.kd_supplier_remit(uuid, uuid, numeric, date, text, text, text, jsonb, uuid, text);
drop function if exists public.kd_bill_post(uuid, uuid, boolean);
drop table if exists public.supplier_remittance_allocations;
drop table if exists public.supplier_remittances;
drop table if exists public.supplier_bill_lines;
drop table if exists public.supplier_bills;
