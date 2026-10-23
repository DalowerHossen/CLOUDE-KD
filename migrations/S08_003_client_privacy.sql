-- path: migrations/S08_003_client_privacy.sql
-- STEP 08.3 Client data management: consent and contact preferences, privacy requests (anonymize, delete) with their
-- approval, and the function that removes personal data from a client in one step.

alter table public.clients add column if not exists marketing_consent boolean not null default false;
alter table public.clients add column if not exists consent_updated_at timestamptz;
alter table public.clients add column if not exists contact_preference text not null default 'email' check (contact_preference in ('email', 'phone'));

create table if not exists public.client_privacy_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind text not null check (kind in ('anonymize', 'delete')),
  reason text not null check (char_length(reason) between 10 and 1000),
  requested_by uuid not null,
  approval_request_id uuid,
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval', 'completed', 'rejected', 'failed')),
  result text not null default '' check (char_length(result) <= 300),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.client_privacy_requests');
select public.rls_enable_default_deny('public.client_privacy_requests');
select public.audit_enable_for('public.client_privacy_requests');

-- One open request per client.
create unique index if not exists uq_client_privacy_open on public.client_privacy_requests (client_id) where status = 'awaiting_approval' and deleted_at is null;
create index if not exists ix_client_privacy_company on public.client_privacy_requests (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_client_privacy_wait on public.client_privacy_requests (status, created_at) where status = 'awaiting_approval' and deleted_at is null;

revoke all on public.client_privacy_requests from authenticated;
grant all on public.client_privacy_requests to service_role;

-- Removes personal data from one client. Names, addresses, contacts, notes and free text history are replaced; numbers
-- (balances, opening balance), the country and the ids stay, so accounts and invoices keep adding up. With p_delete the
-- client is also soft deleted. Raises 22023 when the client is not found or already anonymized.
create or replace function public.kd_client_anonymize(p_company uuid, p_client uuid, p_delete boolean, p_by uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.clients%rowtype;
begin
  select * into c from public.clients where id = p_client and company_id = p_company and deleted_at is null for update;
  if not found or c.anonymized_at is not null then
    raise exception 'client not found or already anonymized' using errcode = '22023';
  end if;
  update public.clients set
    name = 'Anonymized client ' || left(replace(id::text, '-', ''), 8),
    contact_name = '', email = null, billing_email = null, phone = '', website = '', tax_id = '', notes = '',
    tags = '{}', custom_fields = '{}', avatar_file_id = null, portal_prefs = '{}',
    billing_line1 = '', billing_line2 = '', billing_city = '', billing_region = '', billing_postal_code = '',
    shipping_line1 = '', shipping_line2 = '', shipping_city = '', shipping_region = '', shipping_postal_code = '', shipping_country = null,
    do_not_contact = true, reminders_opt_out = true, marketing_consent = false, consent_updated_at = now(),
    anonymized_at = now(), status = 'archived',
    deleted_at = case when p_delete then now() else null end
  where id = p_client;
  update public.client_contacts set deleted_at = now(), is_primary = false where client_id = p_client and deleted_at is null;
  update public.client_activity set title = '', body = '[removed]' where client_id = p_client and kind in ('note', 'call', 'meeting', 'email') and deleted_at is null;
  update public.client_merges set removed_snapshot = '{}'::jsonb where kept_client_id = p_client or removed_client_id = p_client;
  insert into public.client_activity (company_id, client_id, kind, title, body, created_by)
  values (p_company, p_client, 'system', 'Personal data removed', case when p_delete then 'Anonymized and deleted.' else 'Anonymized.' end, p_by);
end
$$;

revoke all on function public.kd_client_anonymize(uuid, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.kd_client_anonymize(uuid, uuid, boolean, uuid) to service_role;
