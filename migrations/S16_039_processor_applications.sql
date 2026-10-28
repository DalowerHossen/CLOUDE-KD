-- path: migrations/S16_039_processor_applications.sql
-- Merchant applications that the platform sends to a payment processor on behalf of a company (NMI Merchant Sign-Up API,
-- docs/processors/nmi.md section 13): one row per application with the processor's own application id, its status and,
-- once boarded, the merchant id and gateway id. The webhook events of the processor are kept once each by their event id.
-- Platform staff reach these rows only through the server (the service role); the default-deny policy applies to everyone else.
create table if not exists public.processor_applications (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  external_id text check (external_id is null or external_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  package_id text not null check (package_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'underwriter_requested_information', 'requested_information_sent', 'boarded', 'closed')
  ),
  business_name text not null default '' check (char_length(business_name) <= 255),
  merchant_id text check (merchant_id is null or char_length(merchant_id) <= 30),
  gateway_id text check (gateway_id is null or char_length(gateway_id) <= 30),
  pending_reason text check (pending_reason is null or char_length(pending_reason) <= 255),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 255),
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.processor_application_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  event_id text not null check (char_length(event_id) between 1 and 64),
  event_type text not null check (char_length(event_type) between 1 and 80),
  external_id text,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.processor_applications');
select public.apply_standard_triggers('public.processor_application_events');
select public.rls_enable_default_deny('public.processor_applications');
select public.rls_enable_default_deny('public.processor_application_events');
select public.audit_enable_for('public.processor_applications');

create unique index if not exists uq_processor_application_external on public.processor_applications (processor_id, external_id) where external_id is not null and deleted_at is null;
create unique index if not exists uq_processor_application_one_open on public.processor_applications (company_id, processor_id) where deleted_at is null and status not in ('rejected', 'cancelled', 'closed');
create unique index if not exists uq_processor_application_event on public.processor_application_events (processor_id, event_id);
create index if not exists ix_processor_applications_company on public.processor_applications (company_id, created_at desc) where deleted_at is null;
