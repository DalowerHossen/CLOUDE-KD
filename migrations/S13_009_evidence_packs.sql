-- path: migrations/S13_009_evidence_packs.sql
-- STEP 13.9.b Evidence packs. Each time the owner makes a pack for a dispute a new version is stored: the PDF and the ZIP
-- (both kept through the storage contract, encrypted, in the company's Google Drive when linked), their checksums, the
-- list of files in the ZIP with their checksums, and the date until which the platform promises to keep it. Append only:
-- a pack is never changed, a later one is a new version. The checksums are also written to the audit chain.

create table if not exists public.evidence_packs (
  -- guard:append-only (a stored evidence pack; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  pdf_file_id uuid not null,
  zip_file_id uuid not null,
  pdf_hash text not null check (pdf_hash ~ '^[0-9a-f]{64}$'),
  zip_hash text not null check (zip_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  sections jsonb not null check (jsonb_typeof(sections) = 'object'),
  processor_id text not null check (char_length(processor_id) between 2 and 40),
  processor_format boolean not null default false,
  retain_until timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_evidence_packs_version on public.evidence_packs (dispute_id, version_no);
create index if not exists ix_evidence_packs_company on public.evidence_packs (company_id, created_at desc);

drop trigger if exists trg_evidence_packs_append on public.evidence_packs;
create trigger trg_evidence_packs_append before update or delete on public.evidence_packs for each row execute function public.kd_invoice_append_only();
select public.rls_enable_default_deny('public.evidence_packs');
revoke all on public.evidence_packs from authenticated;
grant all on public.evidence_packs to service_role;
