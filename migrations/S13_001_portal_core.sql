-- path: migrations/S13_001_portal_core.sql
-- STEP 13.1 Client portal foundation.
--   portal_events   what a client did on a token page (view, code entered, download, re-request): append only, with the
--                   masked address, the keyed address hash, the full address encrypted by the application (purpose "pii"),
--                   the browser string and a short device label. Never written for card fields.
--   link_requests   a client asked for a new link after the old one expired; the owner approves or denies (13.7).
--   kd_portal_token_lookup  read-only: the identity of the document behind a token hash (also for an expired or revoked
--                   token, which the tokens contract does not return); only the service role may call it.

create table if not exists public.portal_events (
  -- guard:append-only (what a client did on a token page; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  token_id uuid not null,
  doc_type text not null check (doc_type in ('invoice', 'estimate', 'receipt', 'hub', 'contract', 'payslip', 'payment')),
  doc_id uuid not null,
  event text not null check (event in ('view', 'code_passed', 'pdf_download', 'print', 'rerequest', 'consent', 'refund_request')),
  ip_masked text check (ip_masked is null or char_length(ip_masked) <= 64),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  ip_enc jsonb,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  device text check (device is null or char_length(device) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.link_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  token_id uuid not null,
  doc_type text not null check (doc_type in ('invoice', 'estimate', 'receipt', 'hub', 'contract', 'payslip', 'payment')),
  doc_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  decided_by uuid,
  decided_at timestamptz,
  new_token_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'pending') = (decided_at is null))
);

create unique index if not exists uq_link_requests_pending on public.link_requests (token_id) where status = 'pending' and deleted_at is null;
create index if not exists ix_link_requests_company on public.link_requests (company_id, status, created_at desc);
create index if not exists ix_portal_events_doc on public.portal_events (company_id, doc_type, doc_id, created_at desc);
create index if not exists ix_portal_events_token on public.portal_events (token_id, created_at desc);

drop trigger if exists trg_portal_events_append on public.portal_events;
create trigger trg_portal_events_append before update or delete on public.portal_events for each row execute function public.kd_invoice_append_only();

select public.apply_standard_triggers('public.link_requests');
select public.audit_enable_for('public.link_requests');
select public.rls_enable_default_deny('public.portal_events');
select public.rls_enable_default_deny('public.link_requests');

create or replace function public.kd_portal_token_lookup(p_hash text)
returns table (id uuid, company_id uuid, doc_type text, doc_id uuid, expires_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.company_id, t.doc_type, t.doc_id, t.expires_at, t.revoked_at
  from public.access_tokens t
  where t.token_hash = p_hash and t.deleted_at is null
$$;

revoke execute on function public.kd_portal_token_lookup(text) from public, anon, authenticated;
grant execute on function public.kd_portal_token_lookup(text) to service_role;
