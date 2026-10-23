-- path: migrations/S16_003_whatsapp.sql
-- STEP 16.3.a WhatsApp (Meta Cloud API).
--   whatsapp_accounts   the company's connection: WABA id, phone number id, encrypted access token and app secret, the webhook
--                       key and verify token hash, sandbox mode (no call to Meta).
--   whatsapp_templates  message templates (created here or synced from Meta) with their review status.
--   whatsapp_contacts   one row per phone number: opt-in state and the time of the last message from the person (the 24 hour window).
--   whatsapp_messages   every message in and out, with its delivery state. The database refuses a message to someone who opted
--                       out, and to someone who neither opted in nor wrote to the company in the last 24 hours.

create table if not exists public.whatsapp_accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  waba_id text not null check (waba_id ~ '^[0-9]{5,25}$'),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,25}$'),
  display_phone text not null default '' check (char_length(display_phone) <= 40),
  verified_name text not null default '' check (char_length(verified_name) <= 200),
  quality_rating text not null default 'NA' check (quality_rating in ('GREEN', 'YELLOW', 'RED', 'NA')),
  access_token_enc jsonb not null check (jsonb_typeof(access_token_enc) = 'object'),
  access_token_last4 text not null check (char_length(access_token_last4) = 4),
  app_secret_enc jsonb not null check (jsonb_typeof(app_secret_enc) = 'object'),
  webhook_key text not null check (webhook_key ~ '^[0-9A-Za-z]{32}$'),
  verify_token_hash text not null check (verify_token_hash ~ '^[0-9a-f]{64}$'),
  sandbox boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_checked_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.whatsapp_accounts (id) on delete restrict,
  name text not null check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  language text not null check (language ~ '^[a-z]{2,3}(_[A-Za-z]{2,4})?$'),
  category text not null check (category in ('authentication', 'marketing', 'utility')),
  parameter_format text not null default 'positional' check (parameter_format in ('named', 'positional')),
  components jsonb not null check (jsonb_typeof(components) = 'array'),
  status text not null default 'PENDING' check (char_length(status) between 1 and 40),
  meta_template_id text check (meta_template_id is null or char_length(meta_template_id) <= 60),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 200),
  source text not null default 'created' check (source in ('created', 'synced')),
  last_synced_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.whatsapp_contacts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  profile_name text not null default '' check (char_length(profile_name) <= 200),
  client_id uuid,
  opt_status text not null default 'unknown' check (opt_status in ('opted_in', 'opted_out', 'unknown')),
  opt_source text not null default '' check (char_length(opt_source) <= 60),
  opt_changed_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((opt_status = 'unknown') = (opt_changed_at is null))
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.whatsapp_accounts (id) on delete restrict,
  contact_id uuid not null references public.whatsapp_contacts (id) on delete restrict,
  direction text not null check (direction in ('out', 'in')),
  type text not null default 'text' check (type in ('text', 'template', 'other')),
  template_id uuid references public.whatsapp_templates (id) on delete restrict,
  body text not null default '' check (char_length(body) <= 4096),
  wa_message_id text check (wa_message_id is null or char_length(wa_message_id) <= 200),
  status text not null check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_code integer,
  error_text text check (error_text is null or char_length(error_text) <= 300),
  origin text not null default 'manual' check (origin in ('manual', 'reply', 'rule', 'campaign', 'system')),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  sandbox boolean not null default false,
  sent_by uuid,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((direction = 'in') = (status = 'received')),
  check (type <> 'template' or template_id is not null or direction = 'in')
);

select public.apply_standard_triggers('public.whatsapp_accounts');
select public.apply_standard_triggers('public.whatsapp_templates');
select public.apply_standard_triggers('public.whatsapp_contacts');
select public.apply_standard_triggers('public.whatsapp_messages');
select public.rls_enable_default_deny('public.whatsapp_accounts');
select public.rls_enable_default_deny('public.whatsapp_templates');
select public.rls_enable_default_deny('public.whatsapp_contacts');
select public.rls_enable_default_deny('public.whatsapp_messages');
select public.audit_enable_for('public.whatsapp_accounts');
select public.audit_enable_for('public.whatsapp_templates');
select public.audit_enable_for('public.whatsapp_contacts');

create unique index if not exists uq_whatsapp_accounts_company on public.whatsapp_accounts (company_id) where deleted_at is null;
create unique index if not exists uq_whatsapp_accounts_key on public.whatsapp_accounts (webhook_key);
create unique index if not exists uq_whatsapp_templates_name on public.whatsapp_templates (account_id, name, language) where deleted_at is null;
create index if not exists ix_whatsapp_templates_company on public.whatsapp_templates (company_id, name) where deleted_at is null;
create unique index if not exists uq_whatsapp_contacts_phone on public.whatsapp_contacts (company_id, phone_e164) where deleted_at is null;
create unique index if not exists uq_whatsapp_messages_wa on public.whatsapp_messages (account_id, wa_message_id) where wa_message_id is not null;
create unique index if not exists uq_whatsapp_messages_idem on public.whatsapp_messages (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists ix_whatsapp_messages_company on public.whatsapp_messages (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_whatsapp_messages_contact on public.whatsapp_messages (contact_id, created_at desc) where deleted_at is null;

-- The account, contact and template of a message belong to its company.
create or replace function public.kd_whatsapp_message_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_account uuid; v_contact public.whatsapp_contacts%rowtype; v_template uuid;
  rank_old integer; rank_new integer;
begin
  if tg_op = 'INSERT' then
    select company_id into v_account from public.whatsapp_accounts where id = new.account_id;
    if v_account is null or v_account <> new.company_id then raise exception 'the account was not found' using errcode = 'P0002'; end if;
    select * into v_contact from public.whatsapp_contacts where id = new.contact_id;
    if v_contact.id is null or v_contact.company_id <> new.company_id then raise exception 'the contact was not found' using errcode = 'P0002'; end if;
    if new.template_id is not null then
      select company_id into v_template from public.whatsapp_templates where id = new.template_id;
      if v_template is null or v_template <> new.company_id then raise exception 'the template was not found' using errcode = 'P0002'; end if;
    end if;
    -- Consent: nothing goes to someone who opted out, or to someone who neither opted in nor wrote in the last 24 hours.
    if new.direction = 'out' then
      if v_contact.opt_status = 'opted_out' then
        raise exception 'this person opted out of messages' using errcode = '42501';
      end if;
      if v_contact.opt_status <> 'opted_in' and (v_contact.last_inbound_at is null or v_contact.last_inbound_at < now() - interval '24 hours') then
        raise exception 'this person did not opt in' using errcode = '42501';
      end if;
    end if;
  else
    if new.company_id is distinct from old.company_id or new.account_id is distinct from old.account_id
       or new.contact_id is distinct from old.contact_id or new.direction is distinct from old.direction
       or new.body is distinct from old.body or new.template_id is distinct from old.template_id then
      raise exception 'a message keeps its account, contact, direction and text' using errcode = '55000';
    end if;
    if new.status is distinct from old.status then
      rank_old := case old.status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 9 end;
      rank_new := case new.status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 9 end;
      if old.status in ('failed', 'read', 'received') then
        raise exception 'a finished message does not change' using errcode = '55000';
      end if;
      if new.status <> 'failed' and rank_new < rank_old then
        raise exception 'a message status does not go back' using errcode = '55000';
      end if;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_messages_guard on public.whatsapp_messages;
create trigger trg_whatsapp_messages_guard before insert or update on public.whatsapp_messages for each row execute function public.kd_whatsapp_message_guard();

-- A template belongs to an account of its company; its name, language and category do not change after it was created
-- (Meta treats a change as a new template).
create or replace function public.kd_whatsapp_template_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_op = 'INSERT' then
    select company_id into v_company from public.whatsapp_accounts where id = new.account_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the account was not found' using errcode = 'P0002'; end if;
  elsif new.name is distinct from old.name or new.language is distinct from old.language
        or new.account_id is distinct from old.account_id or new.company_id is distinct from old.company_id then
    raise exception 'a template keeps its name, language and account' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_templates_guard on public.whatsapp_templates;
create trigger trg_whatsapp_templates_guard before insert or update on public.whatsapp_templates for each row execute function public.kd_whatsapp_template_guard();

-- A person who opted out does not go back to a state without a decision, and the phone number of a contact does not change.
create or replace function public.kd_whatsapp_contact_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.phone_e164 is distinct from old.phone_e164 or new.company_id is distinct from old.company_id then
      raise exception 'the phone number of a contact does not change' using errcode = '55000';
    end if;
    if new.opt_status = 'unknown' and old.opt_status <> 'unknown' then
      raise exception 'a decision about messages cannot be removed' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_contacts_guard on public.whatsapp_contacts;
create trigger trg_whatsapp_contacts_guard before insert or update on public.whatsapp_contacts for each row execute function public.kd_whatsapp_contact_guard();
