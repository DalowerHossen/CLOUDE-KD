-- path: migrations/S16_029_payment_card_last4.sql
-- STEP 16 Find a payment by the last four digits of the card. A payment keeps the last four digits and the brand of its card, as the
-- processor returned them, and nothing more of the number. Support staff (and an owner, for the owner's own payments) search by them.
-- Older payments have no value: the processors did not give the digits before this change was made.

alter table public.payments add column if not exists card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
alter table public.payments add column if not exists card_brand text check (card_brand is null or card_brand ~ '^[a-z0-9 _-]{1,20}$');

create index if not exists idx_payments_card_last4 on public.payments (card_last4, created_at desc) where card_last4 is not null and deleted_at is null;
create index if not exists idx_payments_company_card_last4 on public.payments (company_id, card_last4, created_at desc) where card_last4 is not null and deleted_at is null;
