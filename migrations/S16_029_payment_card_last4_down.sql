-- path: migrations/S16_029_payment_card_last4_down.sql
drop index if exists public.idx_payments_company_card_last4;
drop index if exists public.idx_payments_card_last4;
alter table public.payments drop column if exists card_brand;
alter table public.payments drop column if exists card_last4;
