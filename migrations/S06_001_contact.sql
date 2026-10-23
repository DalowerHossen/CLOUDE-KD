-- path: migrations/S06_001_contact.sql
-- STEP 06.2 Messages from the public contact form. Read by platform staff in the leads admin (06.8).

create table if not exists public.contact_messages (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_name text check (company_name is null or char_length(company_name) <= 100),
  topic text not null check (topic in ('sales', 'support', 'security', 'partnership', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'read', 'answered', 'spam')),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.contact_messages');
select public.rls_enable_default_deny('public.contact_messages');
select public.audit_enable_for('public.contact_messages');

create index if not exists ix_contact_status on public.contact_messages (status, created_at desc) where deleted_at is null;
create index if not exists ix_contact_email on public.contact_messages (email, created_at desc) where deleted_at is null;

revoke all on public.contact_messages from authenticated;
grant all on public.contact_messages to service_role;

-- Messages are kept for 24 months and then removed from view.
create or replace function public.kd_contact_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.contact_messages set deleted_at = now() where deleted_at is null and created_at < now() - interval '24 months';
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_contact_purge() from public, anon, authenticated;
grant execute on function public.kd_contact_purge() to service_role;
