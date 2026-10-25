-- path: migrations/S16_024_kyc_profile_down.sql
drop table if exists public.kyc_platform_settings;
alter table public.kyc_submissions drop column if exists verification_mode;
alter table public.kyc_submissions drop column if exists provider_status;
alter table public.kyc_submissions drop column if exists provider_applicant_id;
alter table public.kyc_submissions drop column if exists business_encrypted;
alter table public.kyc_documents drop constraint if exists kyc_documents_doc_type_check;
delete from public.kyc_documents where doc_type in ('bank_proof', 'tax_certificate', 'selfie_with_id');
alter table public.kyc_documents add constraint kyc_documents_doc_type_check
  check (doc_type in ('id_front', 'id_back', 'business_registration', 'address_proof'));
