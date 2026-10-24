-- path: migrations/S16_020_sub_merchant_kyc_down.sql
drop table if exists public.sub_merchant_kyc_links;
drop table if exists public.sub_merchant_kyc_documents;
drop table if exists public.sub_merchant_kyc;
drop function if exists public.kd_smkyc_guard();
alter table public.gateway_upstreams drop column if exists kyc_required;
alter table public.sub_merchants drop column if exists kyc_approved_until;
