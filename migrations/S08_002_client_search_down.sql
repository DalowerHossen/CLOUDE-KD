-- path: migrations/S08_002_client_search_down.sql
drop function if exists public.kd_client_merge(uuid, uuid, uuid, uuid);
drop function if exists public.kd_client_duplicate_pairs(uuid, integer);
drop function if exists public.kd_client_duplicates(uuid, text, text, text, uuid);
drop function if exists public.kd_client_search(uuid, text, text, text, text, text, boolean, text, boolean, text, uuid, integer);
drop function if exists public.kd_client_set_balances(uuid, uuid, numeric, numeric, timestamptz, timestamptz);
drop table if exists public.client_merges;
drop table if exists public.client_activity;
drop table if exists public.saved_views;
drop index if exists public.ix_clients_last_invoice;
drop index if exists public.ix_clients_balance;
drop index if exists public.ix_clients_phone_trgm;
drop index if exists public.ix_clients_email_trgm;
drop index if exists public.ix_clients_name_trgm;
alter table public.clients drop column if exists last_payment_at;
alter table public.clients drop column if exists last_invoice_at;
alter table public.clients drop column if exists overdue_balance;
alter table public.clients drop column if exists outstanding_balance;
