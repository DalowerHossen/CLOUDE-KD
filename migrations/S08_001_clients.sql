-- path: migrations/S08_001_clients.sql
-- STEP 08.1 Clients: the client record, its contact people, and the custom fields a company adds to clients, products
-- and suppliers. Rows are reached only through the server (closed to browser roles).

create table if not exists public.clients (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null default 'company' check (kind in ('company', 'person')),
  name text not null check (char_length(name) between 1 and 200),
  contact_name text not null default '' check (char_length(contact_name) <= 200),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  billing_email text check (billing_email is null or (billing_email = lower(billing_email) and char_length(billing_email) <= 254 and billing_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text not null default '' check (char_length(phone) <= 30),
  website text not null default '' check (char_length(website) <= 200),
  tax_id text not null default '' check (char_length(tax_id) <= 40),
  display_currency char(3) not null default 'USD' check (display_currency ~ '^[A-Z]{3}$'),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 365),
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  avatar_file_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  billing_line1 text not null default '' check (char_length(billing_line1) <= 200),
  billing_line2 text not null default '' check (char_length(billing_line2) <= 200),
  billing_city text not null default '' check (char_length(billing_city) <= 100),
  billing_region text not null default '' check (char_length(billing_region) <= 100),
  billing_postal_code text not null default '' check (char_length(billing_postal_code) <= 20),
  billing_country char(2) check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  shipping_line1 text not null default '' check (char_length(shipping_line1) <= 200),
  shipping_line2 text not null default '' check (char_length(shipping_line2) <= 200),
  shipping_city text not null default '' check (char_length(shipping_city) <= 100),
  shipping_region text not null default '' check (char_length(shipping_region) <= 100),
  shipping_postal_code text not null default '' check (char_length(shipping_postal_code) <= 20),
  shipping_country char(2) check (shipping_country is null or shipping_country ~ '^[A-Z]{2}$'),
  opening_balance numeric(18,4) not null default 0,
  credit_balance numeric(18,4) not null default 0 check (credit_balance >= 0),
  credit_limit numeric(18,4) check (credit_limit is null or credit_limit >= 0),
  risk_flag text not null default 'none' check (risk_flag in ('none', 'watch', 'high')),
  do_not_contact boolean not null default false,
  reminders_opt_out boolean not null default false,
  portal_prefs jsonb not null default '{}' check (jsonb_typeof(portal_prefs) = 'object'),
  anonymized_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.client_contacts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  role text not null default '' check (char_length(role) <= 100),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text not null default '' check (char_length(phone) <= 30),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.custom_field_defs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entity text not null check (entity in ('client', 'product', 'supplier')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 80),
  kind text not null check (kind in ('text', 'number', 'date', 'select', 'bool')),
  options text[] not null default '{}' check (cardinality(options) <= 30),
  required boolean not null default false,
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kind <> 'select' or cardinality(options) >= 1)
);

select public.apply_standard_triggers('public.clients');
select public.apply_standard_triggers('public.client_contacts');
select public.apply_standard_triggers('public.custom_field_defs');
select public.rls_enable_default_deny('public.clients');
select public.rls_enable_default_deny('public.client_contacts');
select public.rls_enable_default_deny('public.custom_field_defs');
select public.audit_enable_for('public.clients');
select public.audit_enable_for('public.client_contacts');
select public.audit_enable_for('public.custom_field_defs');

create index if not exists ix_clients_company_name on public.clients (company_id, lower(name)) where deleted_at is null;
create index if not exists ix_clients_company_status on public.clients (company_id, status, created_at desc) where deleted_at is null;
create index if not exists ix_clients_company_email on public.clients (company_id, email) where deleted_at is null and email is not null;
create index if not exists ix_clients_tags on public.clients using gin (tags);
create index if not exists ix_client_contacts_client on public.client_contacts (client_id) where deleted_at is null;
-- One primary contact per client; one definition per entity and key.
create unique index if not exists uq_client_contact_primary on public.client_contacts (client_id) where is_primary and deleted_at is null;
create unique index if not exists uq_custom_field_key on public.custom_field_defs (company_id, entity, key) where deleted_at is null;

revoke all on public.clients, public.client_contacts, public.custom_field_defs from authenticated;
grant all on public.clients, public.client_contacts, public.custom_field_defs to service_role;

-- Replaces the contact people of one client in one step. p_rows: [{name, role, email, phone}, ...]; the first row is the
-- primary contact. Raises 22023 when the client does not belong to the company or the list is too long.
create or replace function public.kd_client_contacts_replace(p_company uuid, p_client uuid, p_rows jsonb) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r jsonb;
  n integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10 then
    raise exception 'contact list is not valid' using errcode = '22023';
  end if;
  perform 1 from public.clients where id = p_client and company_id = p_company and deleted_at is null for update;
  if not found then
    raise exception 'client not found' using errcode = '22023';
  end if;
  update public.client_contacts set deleted_at = now(), is_primary = false where client_id = p_client and deleted_at is null;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.client_contacts (company_id, client_id, name, role, email, phone, is_primary)
    values (p_company, p_client, r ->> 'name', coalesce(r ->> 'role', ''), nullif(r ->> 'email', ''), coalesce(r ->> 'phone', ''), n = 0);
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public.kd_client_contacts_replace(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kd_client_contacts_replace(uuid, uuid, jsonb) to service_role;
