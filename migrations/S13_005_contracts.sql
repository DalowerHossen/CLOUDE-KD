-- path: migrations/S13_005_contracts.sql
-- STEP 13.6.a Contracts: custom templates, contracts (with a gap-free-by-company display number from one sequence), a
-- snapshot of every saved version (append only), the people who must sign (with their order) and an event log (append
-- only). The signature evidence itself is added in 13.6.b.

create sequence if not exists public.contract_number_seq;

create table if not exists public.contract_templates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  body_html text not null check (char_length(body_html) between 1 and 200000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.contracts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  number bigint not null default nextval('public.contract_number_seq'),
  client_id uuid references public.clients (id) on delete restrict,
  template_key text check (template_key is null or char_length(template_key) <= 80),
  title text not null check (char_length(title) between 2 and 200),
  body_html text not null check (char_length(body_html) <= 200000),
  merge_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'partly_signed', 'signed', 'declined', 'void', 'expired')),
  signing_order text not null default 'parallel' check (signing_order in ('parallel', 'sequential')),
  amount numeric(18,4) check (amount is null or amount >= 0),
  effective_on date,
  ends_on date,
  sign_by date,
  renewal_notice_days integer not null default 30 check (renewal_notice_days between 0 and 365),
  body_hash text check (body_hash is null or body_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  signed_at timestamptz,
  closed_reason text not null default '' check (char_length(closed_reason) <= 500),
  renewal_notified_at timestamptz,
  invoice_id uuid,
  estimate_id uuid,
  archived_file_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (ends_on is null or effective_on is null or ends_on >= effective_on),
  check (status = 'draft' or body_hash is not null)
);

create table if not exists public.contract_versions (
  -- guard:append-only (every saved wording; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  title text not null,
  body_html text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_signers (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  position integer not null check (position between 1 and 10),
  name text not null check (char_length(name) between 2 and 200),
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_label text not null default '' check (char_length(role_label) <= 80),
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'declined')),
  token_id uuid,
  invited_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  reminder_count integer not null default 0 check (reminder_count >= 0),
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.contract_events (
  -- guard:append-only (what happened to a contract; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  signer_id uuid,
  kind text not null check (kind in ('created', 'edited', 'sent', 'invited', 'viewed', 'reminded', 'signed', 'declined', 'voided', 'expired', 'renewal_notice')),
  detail text not null default '' check (char_length(detail) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.contract_templates');
select public.apply_standard_triggers('public.contracts');
select public.apply_standard_triggers('public.contract_signers');
select public.rls_enable_default_deny('public.contract_templates');
select public.rls_enable_default_deny('public.contracts');
select public.rls_enable_default_deny('public.contract_versions');
select public.rls_enable_default_deny('public.contract_signers');
select public.rls_enable_default_deny('public.contract_events');
select public.audit_enable_for('public.contract_templates');
select public.audit_enable_for('public.contracts');
select public.audit_enable_for('public.contract_signers');

drop trigger if exists trg_contract_versions_append on public.contract_versions;
create trigger trg_contract_versions_append before update or delete on public.contract_versions for each row execute function public.kd_invoice_append_only();
drop trigger if exists trg_contract_events_append on public.contract_events;
create trigger trg_contract_events_append before update or delete on public.contract_events for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_contracts_number on public.contracts (number);
create index if not exists ix_contracts_company on public.contracts (company_id, status, created_at desc) where deleted_at is null;
create index if not exists ix_contracts_client on public.contracts (company_id, client_id) where deleted_at is null and client_id is not null;
create index if not exists ix_contracts_ends on public.contracts (ends_on) where deleted_at is null and status = 'signed';
create index if not exists ix_contracts_sign_by on public.contracts (sign_by) where deleted_at is null and status in ('sent', 'viewed', 'partly_signed');
create unique index if not exists uq_contract_versions on public.contract_versions (contract_id, version_no);
create unique index if not exists uq_contract_signer_position on public.contract_signers (contract_id, position) where deleted_at is null;
create unique index if not exists uq_contract_signer_email on public.contract_signers (contract_id, email) where deleted_at is null;
create index if not exists ix_contract_events on public.contract_events (contract_id, created_at);
create index if not exists ix_contract_templates_company on public.contract_templates (company_id) where deleted_at is null;

revoke all on public.contract_templates, public.contracts, public.contract_versions, public.contract_signers, public.contract_events from authenticated;
grant all on public.contract_templates, public.contracts, public.contract_versions, public.contract_signers, public.contract_events to service_role;
grant usage on sequence public.contract_number_seq to service_role;

-- Create or update a draft contract in one step: the contract row, a version snapshot, the signers and the event.
-- Errors: P0002 not found, 22023 not a draft any more, 40001 somebody else saved first.
create or replace function public.kd_contract_save(p_company uuid, p_actor uuid, p_id uuid, p_expected integer, p_fields jsonb, p_signers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_status text;
  v_ver integer;
  v_next integer;
begin
  if p_id is null then
    insert into public.contracts (company_id, client_id, template_key, title, body_html, merge_data, signing_order, amount, effective_on, ends_on, sign_by, renewal_notice_days, created_by)
    values (p_company, nullif(p_fields->>'client_id', '')::uuid, nullif(p_fields->>'template_key', ''), p_fields->>'title', p_fields->>'body_html',
            coalesce(p_fields->'merge_data', '{}'::jsonb), coalesce(p_fields->>'signing_order', 'parallel'), nullif(p_fields->>'amount', '')::numeric,
            nullif(p_fields->>'effective_on', '')::date, nullif(p_fields->>'ends_on', '')::date, nullif(p_fields->>'sign_by', '')::date,
            coalesce((p_fields->>'renewal_notice_days')::integer, 30), p_actor)
    returning id into v_id;
    insert into public.contract_events (company_id, contract_id, kind, actor_id) values (p_company, v_id, 'created', p_actor);
  else
    select status, version into v_status, v_ver from public.contracts where id = p_id and company_id = p_company and deleted_at is null for update;
    if not found then raise exception 'contract not found' using errcode = 'P0002'; end if;
    if v_status <> 'draft' then raise exception 'contract is not a draft' using errcode = '22023'; end if;
    if v_ver <> p_expected then raise exception 'contract was changed' using errcode = '40001'; end if;
    update public.contracts set
      client_id = nullif(p_fields->>'client_id', '')::uuid,
      template_key = nullif(p_fields->>'template_key', ''),
      title = p_fields->>'title',
      body_html = p_fields->>'body_html',
      merge_data = coalesce(p_fields->'merge_data', '{}'::jsonb),
      signing_order = coalesce(p_fields->>'signing_order', 'parallel'),
      amount = nullif(p_fields->>'amount', '')::numeric,
      effective_on = nullif(p_fields->>'effective_on', '')::date,
      ends_on = nullif(p_fields->>'ends_on', '')::date,
      sign_by = nullif(p_fields->>'sign_by', '')::date,
      renewal_notice_days = coalesce((p_fields->>'renewal_notice_days')::integer, 30)
    where id = p_id;
    insert into public.contract_events (company_id, contract_id, kind, actor_id) values (p_company, v_id, 'edited', p_actor);
  end if;
  select coalesce(max(version_no), 0) + 1 into v_next from public.contract_versions where contract_id = v_id;
  insert into public.contract_versions (company_id, contract_id, version_no, title, body_html, created_by)
  values (p_company, v_id, v_next, p_fields->>'title', p_fields->>'body_html', p_actor);
  update public.contract_signers set deleted_at = now() where contract_id = v_id and deleted_at is null;
  insert into public.contract_signers (company_id, contract_id, position, name, email, role_label)
  select p_company, v_id, (s->>'position')::integer, s->>'name', lower(s->>'email'), coalesce(s->>'role_label', '')
  from jsonb_array_elements(p_signers) s;
  return v_id;
end
$$;

revoke execute on function public.kd_contract_save(uuid, uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.kd_contract_save(uuid, uuid, uuid, integer, jsonb, jsonb) to service_role;
