-- path: migrations/S13_003_delivery_proofs.sql
-- STEP 13.4 Proof of every client message: which message (the outbox row of STEP 05), for which document, to whom (masked,
-- and the full address encrypted for evidence packs), the subject and a hash of the body that was sent. The later life of
-- the message (delivered, opened, clicked, bounced) stays in the e-mail tables and is read from there. Append only.

create table if not exists public.delivery_proofs (
  -- guard:append-only (delivery proof; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  outbox_id uuid not null,
  template text not null check (template ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  doc_type text not null check (doc_type in ('invoice', 'estimate', 'receipt', 'hub', 'contract', 'payment', 'statement', 'credit_note', 'other')),
  doc_id uuid,
  client_id uuid,
  token_id uuid,
  to_masked text not null check (char_length(to_masked) between 3 and 254),
  to_enc jsonb not null,
  subject text not null check (char_length(subject) <= 300),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  sent_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_delivery_proofs_outbox on public.delivery_proofs (outbox_id);
create index if not exists ix_delivery_proofs_doc on public.delivery_proofs (company_id, doc_type, doc_id, created_at desc);
create index if not exists ix_delivery_proofs_client on public.delivery_proofs (company_id, client_id, created_at desc) where client_id is not null;

drop trigger if exists trg_delivery_proofs_append on public.delivery_proofs;
create trigger trg_delivery_proofs_append before update or delete on public.delivery_proofs for each row execute function public.kd_invoice_append_only();

select public.rls_enable_default_deny('public.delivery_proofs');
