-- path: migrations/S16_024_kyc_profile.sql
-- STEP 16 KYC profile. The platform team chooses how a company is verified: by hand (the owner fills a form and a reviewer
-- decides) or automatically through an online verification service. It also chooses which documents are required or
-- optional and which business questions the form asks (to match what the payment processors ask of a merchant).
-- Adds more document types, the answers to the business questions (encrypted) and the one row of platform settings.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.kyc_documents'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%doc_type%'
  loop
    execute format('alter table public.kyc_documents drop constraint %I', c);
  end loop;
end
$$;

alter table public.kyc_documents add constraint kyc_documents_doc_type_check
  check (doc_type in ('id_front', 'id_back', 'business_registration', 'address_proof', 'bank_proof', 'tax_certificate', 'selfie_with_id'));

alter table public.kyc_submissions add column if not exists business_encrypted jsonb;
alter table public.kyc_submissions add column if not exists provider_applicant_id text check (provider_applicant_id is null or char_length(provider_applicant_id) <= 120);
alter table public.kyc_submissions add column if not exists provider_status text check (provider_status is null or provider_status in ('created', 'pending', 'approved', 'rejected', 'retry'));
alter table public.kyc_submissions add column if not exists verification_mode text not null default 'manual' check (verification_mode in ('manual', 'automatic'));

create table if not exists public.kyc_platform_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  mode text not null default 'manual' check (mode in ('manual', 'automatic')),
  provider text not null default 'none' check (provider in ('none', 'sumsub')),
  presentation text not null default 'hosted' check (presentation in ('hosted', 'embedded')),
  required_documents text[] not null default array['id_front', 'id_back', 'business_registration', 'address_proof'],
  optional_documents text[] not null default array[]::text[],
  business_fields text[] not null default array[]::text[],
  provider_config jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (mode <> 'automatic' or provider <> 'none'),
  check (required_documents <@ array['id_front', 'id_back', 'business_registration', 'address_proof', 'bank_proof', 'tax_certificate', 'selfie_with_id']),
  check (optional_documents <@ array['id_front', 'id_back', 'business_registration', 'address_proof', 'bank_proof', 'tax_certificate', 'selfie_with_id'])
);

select public.apply_standard_triggers('public.kyc_platform_settings');
select public.rls_enable_default_deny('public.kyc_platform_settings');
select public.audit_enable_for('public.kyc_platform_settings');

-- There is exactly one live row of platform settings.
create unique index if not exists uq_kyc_platform_settings_one on public.kyc_platform_settings ((true)) where deleted_at is null;
