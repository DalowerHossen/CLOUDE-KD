-- path: migrations/S16_020_sub_merchant_kyc.sql
-- STEP 16.13.a Sub-merchant KYC.
--   sub_merchant_kyc            one submission per round of a sub-merchant (business, owners sealed, review and screening state).
--   sub_merchant_kyc_documents  the four documents (the files are in storage; only their ids and hashes are here).
--   sub_merchant_kyc_links      the secure links of a sub-merchant (only the hash of the link is kept).
-- sub_merchants.kyc_approved_until says until when the sub-merchant counts as verified; gateway_upstreams.kyc_required says
-- whether the gateway asks for it.

alter table public.sub_merchants add column if not exists kyc_approved_until timestamptz;
alter table public.gateway_upstreams add column if not exists kyc_required boolean not null default true;

create table if not exists public.sub_merchant_kyc (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid not null references public.sub_merchants (id) on delete restrict,
  round integer not null default 1 check (round >= 1),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected', 'expired')),
  business_name text check (business_name is null or char_length(business_name) between 1 and 200),
  business_country text check (business_country is null or business_country ~ '^[A-Z]{2}$'),
  owners_encrypted jsonb check (owners_encrypted is null or jsonb_typeof(owners_encrypted) = 'object'),
  risk_level text check (risk_level is null or risk_level in ('low', 'medium', 'high')),
  review_note text not null default '' check (char_length(review_note) <= 4000),
  decision_reason text not null default '' check (char_length(decision_reason) <= 1000),
  reviewer_id uuid,
  submitted_at timestamptz,
  review_started_at timestamptz,
  decided_at timestamptz,
  expires_at timestamptz,
  screening_status text not null default 'not_run' check (screening_status in ('not_run', 'not_configured', 'clear', 'hits', 'error')),
  screening_summary text not null default '' check (char_length(screening_summary) <= 1000),
  screened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sub_merchant_kyc_documents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  submission_id uuid not null references public.sub_merchant_kyc (id) on delete restrict,
  doc_type text not null check (doc_type in ('id_front', 'id_back', 'business_registration', 'address_proof')),
  file_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 150),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  content_hash text not null check (char_length(content_hash) between 32 and 128),
  document_expires_on date,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reject_reason text not null default '' check (char_length(reject_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sub_merchant_kyc_links (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid not null references public.sub_merchants (id) on delete restrict,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.sub_merchant_kyc');
select public.apply_standard_triggers('public.sub_merchant_kyc_documents');
select public.apply_standard_triggers('public.sub_merchant_kyc_links');
select public.rls_enable_default_deny('public.sub_merchant_kyc');
select public.rls_enable_default_deny('public.sub_merchant_kyc_documents');
select public.rls_enable_default_deny('public.sub_merchant_kyc_links');
select public.audit_enable_for('public.sub_merchant_kyc');
select public.audit_enable_for('public.sub_merchant_kyc_documents');
select public.audit_enable_for('public.sub_merchant_kyc_links');

create unique index if not exists uq_smkyc_round on public.sub_merchant_kyc (sub_merchant_id, round);
-- One open submission per sub-merchant.
create unique index if not exists uq_smkyc_open on public.sub_merchant_kyc (sub_merchant_id) where status in ('draft', 'submitted', 'in_review', 'changes_requested') and deleted_at is null;
create index if not exists ix_smkyc_queue on public.sub_merchant_kyc (company_id, status, submitted_at) where deleted_at is null;
create unique index if not exists uq_smkyc_doc_type on public.sub_merchant_kyc_documents (submission_id, doc_type) where deleted_at is null;
create unique index if not exists uq_smkyc_link_hash on public.sub_merchant_kyc_links (token_hash);
create index if not exists ix_smkyc_links_sub on public.sub_merchant_kyc_links (sub_merchant_id) where deleted_at is null;

-- Rows belong to the company of their parent; a decided submission stays decided (approved can only end as expired).
create or replace function public.kd_smkyc_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'the company of a row does not change' using errcode = '55000';
  end if;
  if tg_table_name = 'sub_merchant_kyc_documents' then
    select company_id into v_company from public.sub_merchant_kyc where id = new.submission_id;
  else
    select company_id into v_company from public.sub_merchants where id = new.sub_merchant_id;
  end if;
  if v_company is null or v_company <> new.company_id then raise exception 'the parent record was not found' using errcode = 'P0002'; end if;
  if tg_table_name = 'sub_merchant_kyc' and tg_op = 'UPDATE' then
    if new.sub_merchant_id is distinct from old.sub_merchant_id or new.round is distinct from old.round then
      raise exception 'the sub-merchant and the round of a submission do not change' using errcode = '55000';
    end if;
    if old.status in ('rejected', 'expired') and new.status <> old.status then
      raise exception 'a decided submission does not change' using errcode = '55000';
    end if;
    if old.status = 'approved' and new.status not in ('approved', 'expired') then
      raise exception 'an approved submission can only expire' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_smkyc_guard on public.sub_merchant_kyc;
create trigger trg_smkyc_guard before insert or update on public.sub_merchant_kyc for each row execute function public.kd_smkyc_guard();
drop trigger if exists trg_smkyc_docs_guard on public.sub_merchant_kyc_documents;
create trigger trg_smkyc_docs_guard before insert or update on public.sub_merchant_kyc_documents for each row execute function public.kd_smkyc_guard();
drop trigger if exists trg_smkyc_links_guard on public.sub_merchant_kyc_links;
create trigger trg_smkyc_links_guard before insert or update on public.sub_merchant_kyc_links for each row execute function public.kd_smkyc_guard();

revoke all on public.sub_merchant_kyc, public.sub_merchant_kyc_documents, public.sub_merchant_kyc_links from authenticated;
grant all on public.sub_merchant_kyc, public.sub_merchant_kyc_documents, public.sub_merchant_kyc_links to service_role;
revoke all on function public.kd_smkyc_guard() from public, anon, authenticated;
grant execute on function public.kd_smkyc_guard() to service_role;
