-- path: migrations/S07_005_domains.sql
-- STEP 07.6 Custom domains of a company: ownership proof by a DNS record, routing and certificate state.

create table if not exists public.custom_domains (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  hostname text not null check (hostname = lower(hostname) and char_length(hostname) between 4 and 253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  verification_token text not null check (verification_token ~ '^[a-f0-9]{32}$'),
  status text not null default 'pending_dns' check (status in ('pending_dns', 'verified', 'failed')),
  routing_ok boolean not null default false,
  ssl_status text not null default 'pending' check (ssl_status in ('pending', 'active', 'error')),
  is_primary boolean not null default false,
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_error text not null default '' check (char_length(last_error) <= 300),
  failing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.custom_domains');
select public.rls_enable_default_deny('public.custom_domains');
select public.audit_enable_for('public.custom_domains');

-- A hostname belongs to one company at a time; one primary domain per company; a primary domain must be verified.
create unique index if not exists uq_custom_domain_host on public.custom_domains (hostname) where deleted_at is null;
create unique index if not exists uq_custom_domain_primary on public.custom_domains (company_id) where is_primary and deleted_at is null;
create index if not exists ix_custom_domain_check on public.custom_domains (last_checked_at) where deleted_at is null;
alter table public.custom_domains drop constraint if exists custom_domains_primary_verified;
alter table public.custom_domains add constraint custom_domains_primary_verified check (not is_primary or status = 'verified');

revoke all on public.custom_domains from authenticated;
grant all on public.custom_domains to service_role;
