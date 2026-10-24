-- path: migrations/S08_008_suppliers_orders_down.sql
drop function if exists public.kd_po_receive(uuid, uuid, jsonb, uuid, text);
drop function if exists public.kd_supplier_search(uuid, text, text, text, text, uuid, integer);
drop table if exists public.purchase_order_lines;
drop table if exists public.purchase_orders;
drop table if exists public.suppliers;
