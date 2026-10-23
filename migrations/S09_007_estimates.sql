-- path: migrations/S09_007_estimates.sql
-- STEP 09.8 Estimates (quotes). An estimate keeps the form input of an invoice (so it converts without retyping) and the
-- worked-out totals. Sending gives it a gap-free number (series EST). The client accepts or declines through a link;
-- the decision stores a signature record (name, time, address, browser, content hash) and cannot be changed afterwards.

create table if not exists public.estimates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  walk_in_name text not null default '' check (char_length(walk_in_name) <= 200),
  number text check (number is null or char_length(number) between 1 and 40),
  status text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted', 'void')),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  subtotal numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  valid_until date not null,
  seller jsonb check (seller is null or jsonb_typeof(seller) = 'object'),
  sent_at timestamptz,
  sent_by uuid,
  viewed_at timestamptz,
  decided_at timestamptz,
  decision_note text not null default '' check (char_length(decision_note) <= 1000),
  signer_name text not null default '' check (char_length(signer_name) <= 200),
  signer_ip text not null default '' check (char_length(signer_ip) <= 64),
  signer_agent text not null default '' check (char_length(signer_agent) <= 300),
  signature_hash text check (signature_hash is null or char_length(signature_hash) = 64),
  converted_invoice_id uuid references public.invoices (id) on delete restrict,
  void_reason text not null default '' check (char_length(void_reason) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status = 'draft' or client_id is not null or walk_in_name <> '')
);

create table if not exists public.estimate_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  estimate_id uuid not null references public.estimates (id) on delete restrict,
  kind text not null check (char_length(kind) between 1 and 40),
  message text not null default '' check (char_length(message) <= 500),
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.estimates');
select public.apply_standard_triggers('public.estimate_events');
select public.rls_enable_default_deny('public.estimates');
select public.rls_enable_default_deny('public.estimate_events');
select public.audit_enable_for('public.estimates');
revoke all on public.estimates, public.estimate_events from authenticated;
grant all on public.estimates, public.estimate_events to service_role;

create unique index if not exists uq_estimate_number on public.estimates (company_id, number) where number is not null and deleted_at is null;
create index if not exists ix_estimates_company on public.estimates (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_estimates_status on public.estimates (company_id, status, valid_until) where deleted_at is null;
create index if not exists ix_estimates_client on public.estimates (client_id) where client_id is not null and deleted_at is null;
create index if not exists ix_estimate_events on public.estimate_events (estimate_id, created_at);

drop trigger if exists trg_estimate_events_append on public.estimate_events;
create trigger trg_estimate_events_append before update or delete on public.estimate_events for each row execute function public.kd_invoice_append_only();

-- Once an estimate was sent its content is fixed. It can go back to a draft (revise) until it is decided; a decision
-- (accepted or declined) can never be changed or erased.
create or replace function public.kd_estimate_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'viewed_at', 'decided_at', 'decision_note', 'signer_name', 'signer_ip',
    'signer_agent', 'signature_hash', 'converted_invoice_id', 'void_reason', 'deleted_at', 'sent_at', 'sent_by', 'seller', 'number'];
begin
  if old.decided_at is not null then
    if (to_jsonb(new) - array['status', 'updated_at', 'version', 'converted_invoice_id', 'void_reason', 'deleted_at']) is distinct from
       (to_jsonb(old) - array['status', 'updated_at', 'version', 'converted_invoice_id', 'void_reason', 'deleted_at']) then
      raise exception 'a decided estimate cannot be changed' using errcode = '42501';
    end if;
    if new.status <> old.status and new.status not in ('converted', 'void') then
      raise exception 'a decided estimate cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'draft' or new.status = 'draft' then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'a sent estimate cannot be changed' using errcode = '42501';
  end if;
  if old.number is not null and new.number is distinct from old.number then
    raise exception 'the estimate number cannot be changed' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_estimates_guard on public.estimates;
create trigger trg_estimates_guard before update on public.estimates for each row execute function public.kd_estimate_guard();

-- Sends a draft: number (if none yet), seller block, status "sent". One transaction; the counter has no gaps.
create or replace function public.kd_estimate_send(p_company uuid, p_estimate uuid, p_prefix text, p_yearly boolean, p_padding integer, p_start bigint, p_year integer, p_seller jsonb, p_by uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  e public.estimates%rowtype;
  n bigint;
  result text;
begin
  select * into e from public.estimates where id = p_estimate and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'estimate not found' using errcode = 'P0002'; end if;
  if e.status <> 'draft' then raise exception 'estimate already sent' using errcode = '22023'; end if;
  if e.client_id is null and e.walk_in_name = '' then raise exception 'estimate has no client' using errcode = '22023'; end if;
  if jsonb_array_length(e.input -> 'lines') = 0 then raise exception 'estimate has no lines' using errcode = '22023'; end if;
  if e.valid_until < current_date then raise exception 'estimate already expired' using errcode = '22023'; end if;
  result := e.number;
  if result is null then
    n := public.kd_next_doc_number(p_company, 'EST', case when p_yearly then p_year else 0 end, p_start);
    result := p_prefix || case when p_yearly then p_year::text || '-' else '' end || lpad(n::text, greatest(p_padding, 1), '0');
  end if;
  update public.estimates set number = result, status = 'sent', seller = p_seller, sent_at = now(), sent_by = p_by, version = version + 1
    where id = p_estimate;
  return result;
end
$$;

-- The client's decision. Only a sent or viewed estimate that is still valid can be decided, and only once.
create or replace function public.kd_estimate_decide(p_estimate uuid, p_decision text, p_name text, p_ip text, p_agent text, p_note text, p_hash text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  e public.estimates%rowtype;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'unknown decision' using errcode = '22023'; end if;
  select * into e from public.estimates where id = p_estimate and deleted_at is null for update;
  if not found then raise exception 'estimate not found' using errcode = 'P0002'; end if;
  if e.status not in ('sent', 'viewed') then raise exception 'estimate cannot be decided' using errcode = '22023'; end if;
  if e.valid_until < current_date then raise exception 'estimate expired' using errcode = '22023'; end if;
  update public.estimates set status = p_decision, decided_at = now(), decision_note = p_note, signer_name = p_name,
    signer_ip = p_ip, signer_agent = p_agent, signature_hash = p_hash, version = version + 1 where id = p_estimate;
  return p_decision;
end
$$;

-- Daily sweep: sent or viewed estimates past their date become expired.
create or replace function public.kd_estimate_expire(p_today date) returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.estimates set status = 'expired', version = version + 1
    where status in ('sent', 'viewed') and valid_until < p_today and deleted_at is null and decided_at is null;
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_estimate_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid), public.kd_estimate_decide(uuid, text, text, text, text, text, text), public.kd_estimate_expire(date) from public, anon, authenticated;
grant execute on function public.kd_estimate_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid), public.kd_estimate_decide(uuid, text, text, text, text, text, text), public.kd_estimate_expire(date) to service_role;
