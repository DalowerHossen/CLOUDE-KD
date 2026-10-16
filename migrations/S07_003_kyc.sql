-- path: migrations/S07_003_kyc.sql
-- STEP 07.4 and 07.5 KYC: submissions of a company, their documents, and the log of every document view by a reviewer.
-- The documents themselves are files in the storage contract (category "kyc"); only their ids are kept here.

create table if not exists public.kyc_submissions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected', 'expired')),
  owners_encrypted jsonb,
  submitted_at timestamptz,
  review_started_at timestamptz,
  reviewer_id uuid,
  review_note text not null default '' check (char_length(review_note) <= 4000),
  decision_reason text not null default '' check (char_length(decision_reason) <= 1000),
  risk_level text check (risk_level is null or risk_level in ('low', 'medium', 'high')),
  duplicate_flag boolean not null default false,
  approval_request_id uuid,
  decided_at timestamptz,
  expires_at timestamptz,
  reverify_due_at timestamptz,
  expiry_notified_at timestamptz,
  round integer not null default 1 check (round >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.kyc_documents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  submission_id uuid not null references public.kyc_submissions (id) on delete restrict,
  doc_type text not null check (doc_type in ('id_front', 'id_back', 'business_registration', 'address_proof')),
  file_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 150),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  content_hash text not null check (char_length(content_hash) between 32 and 128),
  document_expires_on date,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reject_reason text not null default '' check (char_length(reject_reason) <= 500),
  duplicate_of_company uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.kyc_document_views (
  -- guard:append-only (who looked at which document, when, and why; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  document_id uuid not null references public.kyc_documents (id) on delete restrict,
  viewer_id uuid not null,
  viewer_role text not null,
  purpose text not null check (purpose in ('review', 'recheck')),
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.kyc_submissions');
select public.apply_standard_triggers('public.kyc_documents');
select public.rls_enable_default_deny('public.kyc_submissions');
select public.rls_enable_default_deny('public.kyc_documents');
select public.rls_enable_default_deny('public.kyc_document_views');
select public.audit_enable_for('public.kyc_submissions');
select public.audit_enable_for('public.kyc_documents');

-- One unfinished submission per company, one live document per type and submission.
create unique index if not exists uq_kyc_open on public.kyc_submissions (company_id) where status in ('draft', 'submitted', 'in_review', 'changes_requested') and deleted_at is null;
create index if not exists ix_kyc_queue on public.kyc_submissions (status, submitted_at) where deleted_at is null;
create index if not exists ix_kyc_expiry on public.kyc_submissions (expires_at) where status = 'approved' and deleted_at is null;
create unique index if not exists uq_kyc_doc_type on public.kyc_documents (submission_id, doc_type) where deleted_at is null;
create index if not exists ix_kyc_doc_hash on public.kyc_documents (content_hash) where deleted_at is null;
create index if not exists ix_kyc_views_doc on public.kyc_document_views (document_id, created_at desc);

revoke all on public.kyc_submissions, public.kyc_documents, public.kyc_document_views from authenticated;
grant all on public.kyc_submissions, public.kyc_documents, public.kyc_document_views to service_role;

-- The view log is append-only.
create or replace function public.kyc_views_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'the document view log is append-only' using errcode = '22023';
end
$$;
drop trigger if exists trg_kyc_views_guard on public.kyc_document_views;
create trigger trg_kyc_views_guard before update or delete on public.kyc_document_views
  for each row execute function public.kyc_views_guard();

-- Companies other than p_company that sent a document with the same content (copy of one ID used for many accounts).
create or replace function public.kd_kyc_duplicate_of(p_company uuid, p_hash text) returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from public.kyc_documents where content_hash = p_hash and company_id <> p_company and deleted_at is null limit 1
$$;

revoke all on function public.kd_kyc_duplicate_of(uuid, text) from public, anon, authenticated;
grant execute on function public.kd_kyc_duplicate_of(uuid, text) to service_role;
