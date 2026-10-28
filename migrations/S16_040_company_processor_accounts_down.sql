-- path: migrations/S16_040_company_processor_accounts_down.sql
alter table public.payments drop column if exists account_id;
drop table if exists public.company_processor_accounts;
