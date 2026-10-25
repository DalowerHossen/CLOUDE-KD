-- path: migrations/S16_027_payout_kinds_down.sql
alter table public.payout_methods drop constraint if exists payout_methods_kind_check;
alter table public.payout_methods add constraint payout_methods_kind_check
  check (kind in ('bank_transfer', 'wire', 'partner_payout'));
