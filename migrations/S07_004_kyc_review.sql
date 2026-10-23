-- path: migrations/S07_004_kyc_review.sql
-- STEP 07.5 KYC review: screening result and the reviewer who recommended approval (maker of maker-checker).

alter table public.kyc_submissions add column if not exists screening_status text not null default 'not_run' check (screening_status in ('not_run', 'not_configured', 'clear', 'hits', 'error'));
alter table public.kyc_submissions add column if not exists screening_summary text not null default '' check (char_length(screening_summary) <= 1000);
alter table public.kyc_submissions add column if not exists screened_at timestamptz;
alter table public.kyc_submissions add column if not exists recommended_by uuid;
