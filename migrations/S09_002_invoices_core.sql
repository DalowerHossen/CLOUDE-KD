-- path: migrations/S09_002_invoices_core.sql
-- STEP 09.3 Invoices: header, lines, revision history, timeline and applied payments.
-- Money is US dollars in numeric(18,4); quantities numeric(18,4); percentages numeric(7,4). A sent invoice is immutable:
-- the guard trigger refuses every change except the status fields, payment fields and internal notes.

create table if not exists public.invoices (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null default 'invoice' check (kind in ('invoice', 'proforma', 'deposit', 'debit_note')),
  number text check (number is null or char_length(number) between 1 and 40),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void', 'disputed')),
  client_id uuid references public.clients (id) on delete restrict,
  walk_in_name text not null default '' check (char_length(walk_in_name) <= 200),
  bill_to jsonb not null default '{}' check (jsonb_typeof(bill_to) = 'object'),
  ship_to jsonb check (ship_to is null or jsonb_typeof(ship_to) = 'object'),
  seller jsonb check (seller is null or jsonb_typeof(seller) = 'object'),
  issue_date date not null default current_date,
  due_date date not null default current_date,
  payment_terms text not null default 'net_30' check (payment_terms in ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90', 'custom')),
  po_number text not null default '' check (char_length(po_number) <= 60),
  notes text not null default '' check (char_length(notes) <= 20000),
  internal_notes text not null default '' check (char_length(internal_notes) <= 20000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  category text not null default '' check (char_length(category) <= 60),
  project_id uuid,
  paper_size text not null default 'letter' check (paper_size in ('a4', 'letter')),
  template text not null default 'classic' check (template in ('classic', 'modern', 'minimal', 'detailed')),
  price_mode text not null default 'exclusive' check (price_mode in ('exclusive', 'inclusive')),
  discount_order text not null default 'before_tax' check (discount_order in ('before_tax', 'after_tax')),
  rounding_policy text not null default 'per_line' check (rounding_policy in ('per_line', 'on_total')),
  rounding_mode text not null default 'half_up' check (rounding_mode in ('half_up', 'half_even')),
  precision smallint not null default 2 check (precision in (2, 3, 4)),
  cash_rounding text not null default '0' check (cash_rounding in ('0', '0.05', '0.10', '0.50', '1')),
  document_discount_kind text not null default 'none' check (document_discount_kind in ('none', 'percent', 'fixed')),
  document_discount_value numeric(18,4) not null default 0 check (document_discount_value >= 0),
  shipping_amount numeric(18,4) not null default 0,
  shipping_taxable boolean not null default false,
  shipping_taxes jsonb not null default '[]' check (jsonb_typeof(shipping_taxes) = 'array'),
  withholding_rate numeric(7,4) not null default 0 check (withholding_rate between 0 and 100),
  tax_exempt boolean not null default false,
  reverse_charge boolean not null default false,
  subtotal numeric(18,4) not null default 0,
  line_discount_total numeric(18,4) not null default 0,
  document_discount numeric(18,4) not null default 0,
  net_total numeric(18,4) not null default 0,
  shipping numeric(18,4) not null default 0,
  shipping_tax numeric(18,4) not null default 0,
  tax_total numeric(18,4) not null default 0,
  tax_breakdown jsonb not null default '[]' check (jsonb_typeof(tax_breakdown) = 'array'),
  rounding_adjustment numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  withholding numeric(18,4) not null default 0 check (withholding >= 0),
  amount_due numeric(18,4) not null default 0,
  amount_paid numeric(18,4) not null default 0 check (amount_paid >= 0),
  display_currency char(3) check (display_currency is null or (display_currency ~ '^[A-Z]{3}$' and display_currency <> 'USD')),
  fx_rate numeric(20,8) check (fx_rate is null or fx_rate > 0),
  fx_rate_as_of date,
  duplicate_hash text not null default '',
  parent_invoice_id uuid references public.invoices (id) on delete restrict,
  estimate_id uuid,
  recurring_id uuid,
  batch_id uuid,
  approval_request_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text not null default '' check (char_length(rejected_reason) <= 300),
  sent_at timestamptz,
  sent_by uuid,
  viewed_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text not null default '' check (char_length(void_reason) <= 300),
  disputed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (due_date >= issue_date),
  check (client_id is not null or walk_in_name <> '' or status = 'draft'),
  check (amount_paid <= greatest(total, 0) + 0.0001 or status in ('void', 'disputed'))
);

create table if not exists public.invoice_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  position integer not null check (position between 1 and 5000),
  product_id uuid references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  sku text not null default '' check (char_length(sku) <= 40),
  description text not null check (char_length(description) between 1 and 2000),
  hs_code text not null default '' check (char_length(hs_code) <= 20),
  quantity numeric(18,4) not null,
  unit text not null default 'unit' check (char_length(unit) between 1 and 20),
  unit_price numeric(18,4) not null,
  discount_kind text not null default 'none' check (discount_kind in ('none', 'percent', 'fixed')),
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),
  tax_exempt boolean not null default false,
  taxes jsonb not null default '[]' check (jsonb_typeof(taxes) = 'array'),
  gross numeric(18,4) not null default 0,
  line_discount numeric(18,4) not null default 0,
  document_discount_share numeric(18,4) not null default 0,
  net numeric(18,4) not null default 0,
  tax numeric(18,4) not null default 0,
  line_total numeric(18,4) not null default 0,
  time_entry_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.invoice_revisions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  revision integer not null check (revision >= 1),
  reason text not null default '' check (char_length(reason) <= 200),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.invoice_events (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  kind text not null check (char_length(kind) between 1 and 40),
  message text not null default '' check (char_length(message) <= 500),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.invoice_payment_links (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  payment_id uuid not null,
  amount numeric(18,4) not null check (amount > 0),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.invoices');
select public.apply_standard_triggers('public.invoice_items');
select public.apply_standard_triggers('public.invoice_revisions');
select public.apply_standard_triggers('public.invoice_events');
select public.apply_standard_triggers('public.invoice_payment_links');
select public.rls_enable_default_deny('public.invoices');
select public.rls_enable_default_deny('public.invoice_items');
select public.rls_enable_default_deny('public.invoice_revisions');
select public.rls_enable_default_deny('public.invoice_events');
select public.rls_enable_default_deny('public.invoice_payment_links');
select public.audit_enable_for('public.invoices');
select public.audit_enable_for('public.invoice_items');
select public.audit_enable_for('public.invoice_payment_links');
revoke all on public.invoices, public.invoice_items, public.invoice_revisions, public.invoice_events, public.invoice_payment_links from authenticated;
grant all on public.invoices, public.invoice_items, public.invoice_revisions, public.invoice_events, public.invoice_payment_links to service_role;

create unique index if not exists uq_invoice_number on public.invoices (company_id, kind, number) where number is not null and deleted_at is null;
create index if not exists ix_invoices_company on public.invoices (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_invoices_client on public.invoices (client_id) where client_id is not null and deleted_at is null;
create index if not exists ix_invoices_status on public.invoices (company_id, status, due_date) where deleted_at is null;
create index if not exists ix_invoices_duplicate on public.invoices (company_id, duplicate_hash) where duplicate_hash <> '' and deleted_at is null;
create index if not exists ix_invoices_trash on public.invoices (company_id, deleted_at) where deleted_at is not null;
create unique index if not exists uq_invoice_item_position on public.invoice_items (invoice_id, position) where deleted_at is null;
create index if not exists ix_invoice_items_invoice on public.invoice_items (invoice_id) where deleted_at is null;
create index if not exists ix_invoice_items_product on public.invoice_items (product_id) where product_id is not null and deleted_at is null;
create unique index if not exists uq_invoice_revision on public.invoice_revisions (invoice_id, revision);
create index if not exists ix_invoice_events_invoice on public.invoice_events (invoice_id, created_at);
create unique index if not exists uq_invoice_payment_link on public.invoice_payment_links (invoice_id, payment_id) where deleted_at is null;

-- A sent invoice is a legal record. While it is a draft anything can change. Once it waits for approval, is sent or has
-- any later status, only the fields below can change; everything else (client, dates, lines' totals, taxes, rates, notes
-- the client sees) is refused. Moving a waiting invoice back to draft is allowed (rejected or withdrawn).
create or replace function public.kd_invoice_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'viewed_at', 'paid_at', 'amount_paid', 'internal_notes', 'tags', 'category',
    'void_reason', 'voided_at', 'disputed_at', 'approval_request_id', 'approved_by', 'approved_at', 'rejected_reason', 'sent_at',
    'sent_by', 'deleted_at', 'project_id', 'seller', 'number'];
begin
  if old.status = 'draft' or new.status = 'draft' then
    -- A draft that was never sent can be deleted; one that carries payments or a number cannot.
    if new.deleted_at is not null and old.deleted_at is null and (old.amount_paid > 0 or old.status not in ('draft', 'void')) then
      raise exception 'an invoice with payments cannot be deleted' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'a sent invoice cannot be changed' using errcode = '42501';
  end if;
  if new.number is distinct from old.number and old.number is not null then
    raise exception 'the invoice number cannot be changed' using errcode = '42501';
  end if;
  if new.seller is distinct from old.seller and old.seller is not null then
    raise exception 'the seller details are frozen once the invoice is sent' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null and (old.amount_paid > 0 or old.status <> 'void') then
    raise exception 'an invoice that was sent can only be voided, not deleted' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_invoices_guard on public.invoices;
create trigger trg_invoices_guard before update on public.invoices for each row execute function public.kd_invoice_guard();

create or replace function public.kd_invoice_item_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare st text;
begin
  select status into st from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is distinct from 'draft' then
    raise exception 'the lines of an invoice that was submitted cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end
$$;
drop trigger if exists trg_invoice_items_guard on public.invoice_items;
create trigger trg_invoice_items_guard before insert or update on public.invoice_items for each row execute function public.kd_invoice_item_guard();

-- Revisions and the timeline are append only.
create or replace function public.kd_invoice_append_only() returns trigger
language plpgsql
as $$
begin
  if current_setting('kd.allow_hard_delete', true) = 'on' then return coalesce(new, old); end if;
  raise exception 'this record is append only' using errcode = '42501';
end
$$;
drop trigger if exists trg_invoice_revisions_append on public.invoice_revisions;
create trigger trg_invoice_revisions_append before update or delete on public.invoice_revisions for each row execute function public.kd_invoice_append_only();
drop trigger if exists trg_invoice_events_append on public.invoice_events;
create trigger trg_invoice_events_append before update or delete on public.invoice_events for each row execute function public.kd_invoice_append_only();
