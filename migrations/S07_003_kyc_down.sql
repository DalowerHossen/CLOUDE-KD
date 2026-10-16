-- path: migrations/S07_003_kyc_down.sql
drop function if exists public.kd_kyc_duplicate_of(uuid, text);
drop table if exists public.kyc_document_views;
drop table if exists public.kyc_documents;
drop table if exists public.kyc_submissions;
drop function if exists public.kyc_views_guard();
