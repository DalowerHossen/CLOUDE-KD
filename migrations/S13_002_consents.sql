-- path: migrations/S13_002_consents.sql
-- STEP 13.2 Proof that the payer accepted the terms and the refund policy before paying: when, from which address and
-- device, which version of the text, and the exact text that was shown (a snapshot, so a later change of the wording cannot
-- change the proof). Append only. The evidence pack of a dispute (13.9) reads these rows.

create table if not exists public.consent_records (
  -- guard:append-only (consent proof; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  token_id uuid not null,
  doc_type text not null check (doc_type in ('invoice', 'payment')),
  doc_id uuid not null,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  text_snapshot text not null check (char_length(text_snapshot) between 20 and 4000),
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  ip_masked text check (ip_masked is null or char_length(ip_masked) <= 64),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  ip_enc jsonb,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  device text check (device is null or char_length(device) <= 80),
  created_at timestamptz not null default now()
);

create index if not exists ix_consent_records_doc on public.consent_records (company_id, doc_type, doc_id, created_at desc);

drop trigger if exists trg_consent_records_append on public.consent_records;
create trigger trg_consent_records_append before update or delete on public.consent_records for each row execute function public.kd_invoice_append_only();

select public.rls_enable_default_deny('public.consent_records');
