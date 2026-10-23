-- path: migrations/S13_008_disputes.sql
-- STEP 13.8 Disputes (chargebacks) and client refund requests.
--   disputes          one case per dispute the processor opened (made from the `dispute.opened` event), with its status,
--                     reason, amount and the date the answer is due.
--   dispute_evidence  what the company added to the case: notes, files, links, evidence packs (append only).
--   dispute_events    the case history (append only).
--   refund_requests   a client asks for a refund from the receipt page; the owner approves or denies, an approval is
--                     paid back through the payments service of STEP 10.

create table if not exists public.disputes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  processor_id text not null check (char_length(processor_id) between 2 and 40),
  processor_dispute_id text check (processor_dispute_id is null or char_length(processor_dispute_id) <= 200),
  source_event_id text not null check (char_length(source_event_id) between 1 and 300),
  status text not null default 'new' check (status in ('new', 'gathering', 'submitted', 'won', 'lost', 'accepted', 'withdrawn')),
  reason_code text check (reason_code is null or char_length(reason_code) <= 80),
  reason_category text not null default 'general' check (reason_category in ('fraud', 'product_not_received', 'not_as_described', 'duplicate', 'subscription_canceled', 'credit_not_processed', 'general')),
  amount numeric(18,4) not null check (amount > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  due_estimated boolean not null default true,
  submitted_at timestamptz,
  closed_at timestamptz,
  outcome_note text not null default '' check (char_length(outcome_note) <= 1000),
  alerted_72h_at timestamptz,
  alerted_24h_at timestamptz,
  alerted_overdue_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status in ('won', 'lost', 'accepted', 'withdrawn')) = (closed_at is not null))
);

create table if not exists public.dispute_evidence (
  -- guard:append-only (what was added to a case; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  kind text not null check (kind in ('note', 'file', 'link', 'pack')),
  title text not null check (char_length(title) between 2 and 200),
  content text not null default '' check (char_length(content) <= 5000),
  file_id uuid,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (kind not in ('file', 'pack') or file_id is not null)
);

create table if not exists public.dispute_events (
  -- guard:append-only (the case history; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  kind text not null check (kind in ('opened', 'status', 'evidence', 'alert', 'outcome')),
  detail text not null default '' check (char_length(detail) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.refund_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  token_id uuid,
  amount numeric(18,4) not null check (amount > 0),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'processed', 'failed')),
  decided_by uuid,
  decided_at timestamptz,
  deny_reason text not null default '' check (char_length(deny_reason) <= 500),
  failure_note text not null default '' check (char_length(failure_note) <= 300),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'pending') = (decided_at is null))
);

select public.apply_standard_triggers('public.disputes');
select public.apply_standard_triggers('public.refund_requests');
select public.rls_enable_default_deny('public.disputes');
select public.rls_enable_default_deny('public.dispute_evidence');
select public.rls_enable_default_deny('public.dispute_events');
select public.rls_enable_default_deny('public.refund_requests');
select public.audit_enable_for('public.disputes');
select public.audit_enable_for('public.refund_requests');

drop trigger if exists trg_dispute_evidence_append on public.dispute_evidence;
create trigger trg_dispute_evidence_append before update or delete on public.dispute_evidence for each row execute function public.kd_invoice_append_only();
drop trigger if exists trg_dispute_events_append on public.dispute_events;
create trigger trg_dispute_events_append before update or delete on public.dispute_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_disputes_source_event on public.disputes (company_id, source_event_id);
create unique index if not exists uq_disputes_processor_dispute on public.disputes (company_id, processor_id, processor_dispute_id) where processor_dispute_id is not null;
create index if not exists ix_disputes_company on public.disputes (company_id, status, due_at) where deleted_at is null;
create index if not exists ix_disputes_open_due on public.disputes (due_at) where deleted_at is null and status in ('new', 'gathering');
create index if not exists ix_disputes_payment on public.disputes (payment_id) where deleted_at is null;
create index if not exists ix_dispute_evidence on public.dispute_evidence (dispute_id, created_at);
create index if not exists ix_dispute_events on public.dispute_events (dispute_id, created_at);
create unique index if not exists uq_refund_requests_pending on public.refund_requests (payment_id) where status = 'pending' and deleted_at is null;
create index if not exists ix_refund_requests_company on public.refund_requests (company_id, status, created_at desc) where deleted_at is null;

revoke all on public.disputes, public.dispute_evidence, public.dispute_events, public.refund_requests from authenticated;
grant all on public.disputes, public.dispute_evidence, public.dispute_events, public.refund_requests to service_role;
