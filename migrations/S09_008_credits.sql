-- path: migrations/S09_008_credits.sql
-- STEP 09.9 Credit notes and credit applications. A credit note reduces what a client owes for an invoice (return, price
-- error, goodwill). It has its own gap-free numbers (series CN). A credit note, or a paid deposit, is applied to an open
-- invoice of the same client: the application is counted as a payment of that invoice, in one transaction, so the invoice
-- status and balance follow at once. Applications are append only.

create table if not exists public.credit_notes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  walk_in_name text not null default '' check (char_length(walk_in_name) <= 200),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  number text check (number is null or char_length(number) between 1 and 40),
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  reason text not null check (reason in ('return', 'pricing_error', 'goodwill', 'cancellation', 'duplicate', 'other')),
  reason_note text not null default '' check (char_length(reason_note) <= 1000),
  issue_date date not null default current_date,
  bill_to jsonb not null check (jsonb_typeof(bill_to) = 'object'),
  seller jsonb check (seller is null or jsonb_typeof(seller) = 'object'),
  options jsonb not null check (jsonb_typeof(options) = 'object'),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 2000),
  tax_breakdown jsonb not null default '[]' check (jsonb_typeof(tax_breakdown) = 'array'),
  subtotal numeric(18,4) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,4) not null default 0 check (tax_total >= 0),
  total numeric(18,4) not null check (total > 0),
  applied_amount numeric(18,4) not null default 0 check (applied_amount >= 0),
  return_to_stock boolean not null default false,
  issued_at timestamptz,
  issued_by uuid,
  void_reason text not null default '' check (char_length(void_reason) <= 300),
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (applied_amount <= total)
);

create table if not exists public.credit_applications (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  source_type text not null check (source_type in ('credit_note', 'deposit')),
  source_id uuid not null,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.credit_notes');
select public.apply_standard_triggers('public.credit_applications');
select public.rls_enable_default_deny('public.credit_notes');
select public.rls_enable_default_deny('public.credit_applications');
select public.audit_enable_for('public.credit_notes');
select public.audit_enable_for('public.credit_applications');
revoke all on public.credit_notes, public.credit_applications from authenticated;
grant all on public.credit_notes, public.credit_applications to service_role;

create unique index if not exists uq_credit_note_number on public.credit_notes (company_id, number) where number is not null and deleted_at is null;
create index if not exists ix_credit_notes_company on public.credit_notes (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_credit_notes_invoice on public.credit_notes (invoice_id) where deleted_at is null;
create index if not exists ix_credit_notes_client on public.credit_notes (client_id) where client_id is not null and deleted_at is null;
create index if not exists ix_credit_applications_source on public.credit_applications (source_type, source_id);
create index if not exists ix_credit_applications_invoice on public.credit_applications (invoice_id);

drop trigger if exists trg_credit_applications_append on public.credit_applications;
create trigger trg_credit_applications_append before update or delete on public.credit_applications for each row execute function public.kd_invoice_append_only();

-- A draft credit note is free to change. Once issued only the applied amount, the status and the void fields change.
create or replace function public.kd_credit_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'applied_amount', 'void_reason', 'voided_at', 'deleted_at', 'number', 'seller', 'issued_at', 'issued_by'];
begin
  if old.status = 'draft' then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'an issued credit note cannot be changed' using errcode = '42501';
  end if;
  if new.number is distinct from old.number then
    raise exception 'the credit note number cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'a void credit note cannot be used again' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_credit_notes_guard on public.credit_notes;
create trigger trg_credit_notes_guard before update on public.credit_notes for each row execute function public.kd_credit_guard();

create or replace function public.kd_credit_issue(p_company uuid, p_credit uuid, p_prefix text, p_yearly boolean, p_padding integer, p_start bigint, p_year integer, p_seller jsonb, p_by uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  c public.credit_notes%rowtype;
  inv public.invoices%rowtype;
  n bigint;
  result text;
begin
  select * into c from public.credit_notes where id = p_credit and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'credit note not found' using errcode = 'P0002'; end if;
  if c.status <> 'draft' then raise exception 'credit note already issued' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = c.invoice_id and company_id = p_company for update;
  if inv.status in ('draft', 'pending_approval', 'void') then raise exception 'invoice is not sent' using errcode = '22023'; end if;
  if c.total > inv.total - coalesce((select sum(o.total) from public.credit_notes o where o.invoice_id = c.invoice_id and o.status = 'issued' and o.deleted_at is null), 0) then
    raise exception 'credit is more than the invoice' using errcode = '22023';
  end if;
  n := public.kd_next_doc_number(p_company, 'CN', case when p_yearly then p_year else 0 end, p_start);
  result := p_prefix || case when p_yearly then p_year::text || '-' else '' end || lpad(n::text, greatest(p_padding, 1), '0');
  update public.credit_notes set number = result, status = 'issued', seller = p_seller, issued_at = now(), issued_by = p_by, version = version + 1 where id = p_credit;
  return result;
end
$$;

-- Applies a credit note or a deposit to an invoice: records the application and counts it as a payment of the invoice.
create or replace function public.kd_credit_apply(p_company uuid, p_source_type text, p_source_id uuid, p_invoice uuid, p_amount numeric, p_by uuid)
returns table (application_id uuid, invoice_status text, balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  target public.invoices%rowtype;
  src_client uuid;
  src_walk text;
  remaining numeric;
  app uuid;
  res record;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be above zero' using errcode = '22023'; end if;
  select * into target from public.invoices where id = p_invoice and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if target.kind not in ('invoice', 'debit_note') then raise exception 'credit can only be applied to an invoice' using errcode = '22023'; end if;
  if p_source_type = 'credit_note' then
    declare c public.credit_notes%rowtype;
    begin
      select * into c from public.credit_notes where id = p_source_id and company_id = p_company and deleted_at is null for update;
      if not found then raise exception 'credit note not found' using errcode = '22023'; end if;
      if c.status <> 'issued' then raise exception 'credit note is not issued' using errcode = '22023'; end if;
      remaining := c.total - c.applied_amount;
      src_client := c.client_id; src_walk := c.walk_in_name;
      if target.id <> c.invoice_id and (src_client is null or target.client_id is distinct from src_client) then
        raise exception 'credit belongs to another client' using errcode = '22023';
      end if;
      if p_amount > remaining then raise exception 'amount is more than the credit left' using errcode = '22023'; end if;
      app := public.uuid_generate_v7();
      insert into public.credit_applications (id, company_id, source_type, source_id, invoice_id, amount, created_by) values (app, p_company, p_source_type, p_source_id, p_invoice, p_amount, p_by);
      update public.credit_notes set applied_amount = applied_amount + p_amount, version = version + 1 where id = p_source_id;
    end;
  elsif p_source_type = 'deposit' then
    declare d public.invoices%rowtype;
    begin
      select * into d from public.invoices where id = p_source_id and company_id = p_company and deleted_at is null for update;
      if not found or d.kind <> 'deposit' then raise exception 'deposit not found' using errcode = '22023'; end if;
      if d.id = target.id then raise exception 'a deposit cannot be applied to itself' using errcode = '22023'; end if;
      if d.status not in ('partially_paid', 'paid') then raise exception 'deposit is not paid' using errcode = '22023'; end if;
      if (d.client_id is null or d.client_id is distinct from target.client_id)
         and (d.walk_in_name = '' or d.walk_in_name is distinct from target.walk_in_name) then
        raise exception 'deposit belongs to another client' using errcode = '22023';
      end if;
      remaining := d.amount_paid - coalesce((select sum(a.amount) from public.credit_applications a where a.source_type = 'deposit' and a.source_id = d.id and a.deleted_at is null), 0);
      if p_amount > remaining then raise exception 'amount is more than the deposit left' using errcode = '22023'; end if;
      app := public.uuid_generate_v7();
      insert into public.credit_applications (id, company_id, source_type, source_id, invoice_id, amount, created_by) values (app, p_company, p_source_type, p_source_id, p_invoice, p_amount, p_by);
    end;
  else
    raise exception 'unknown credit source' using errcode = '22023';
  end if;
  select * into res from public.kd_invoice_apply_payment(p_invoice, app, p_amount);
  return query select app, res.status, res.balance;
end
$$;

create or replace function public.kd_credit_void(p_company uuid, p_credit uuid, p_reason text, p_by uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare c public.credit_notes%rowtype;
begin
  select * into c from public.credit_notes where id = p_credit and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'credit note not found' using errcode = 'P0002'; end if;
  if c.status <> 'issued' then raise exception 'only an issued credit note can be voided' using errcode = '22023'; end if;
  if c.applied_amount > 0 then raise exception 'credit note was already applied' using errcode = '22023'; end if;
  update public.credit_notes set status = 'void', void_reason = p_reason, voided_at = now(), version = version + 1 where id = p_credit;
end
$$;

revoke all on function public.kd_credit_issue(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid), public.kd_credit_apply(uuid, text, uuid, uuid, numeric, uuid), public.kd_credit_void(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.kd_credit_issue(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid), public.kd_credit_apply(uuid, text, uuid, uuid, numeric, uuid), public.kd_credit_void(uuid, uuid, text, uuid) to service_role;
