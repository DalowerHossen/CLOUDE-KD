-- path: migrations/S14_007_coupons_down.sql
drop function if exists public.kd_coupon_redeem(text, uuid, uuid, text);
alter table public.platform_invoices drop column if exists discount_amount;
alter table public.platform_invoices drop column if exists coupon_redemption_id;
drop table if exists public.coupon_attempts;
drop table if exists public.coupon_redemptions;
drop table if exists public.coupons;
