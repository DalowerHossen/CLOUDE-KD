-- path: migrations/S07_004_kyc_review_down.sql
alter table public.kyc_submissions drop column if exists recommended_by;
alter table public.kyc_submissions drop column if exists screened_at;
alter table public.kyc_submissions drop column if exists screening_summary;
alter table public.kyc_submissions drop column if exists screening_status;
