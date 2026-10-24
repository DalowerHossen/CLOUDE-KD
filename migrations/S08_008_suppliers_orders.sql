-- path: migrations/S08_008_suppliers_orders.sql
-- STEP 08.7 Suppliers and purchase orders. Money is US dollars in numeric(18,4); a tax rate is a percentage.

create table if not exists public.suppliers (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  contact_name text not null default '' check (char_length(contact_name) <= 200),
  email text check (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text not null default '' check (char_length(phone) <= 30),
  website text not null default '' check (char_length(website) <= 200),
  tax_id text not null default '' check (char_length(tax_id) <= 40),
  category text not null default '' check (char_length(category) <= 60),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 365),
  address_line1 text not null default '' check (char_length(address_line1) <= 200),
  address_line2 text not null default '' check (char_length(address_line2) <= 200),
  address_city text not null default '' check (char_length(address_city) <= 100),
  address_region text not null default '' check (char_length(address_region) <= 100),
  address_postal_code text not null default '' check (char_length(address_postal_code) <= 20),
  address_country char(2) check (address_country is null or address_country ~ '^[A-Z]{2}$'),
  notes text not null default '' check (char_length(notes) <= 3000),
  custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.purchase_orders (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  number text not null check (char_length(number) between 3 and 30),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'sent', 'partial', 'received', 'cancelled')),
  order_date date not null default current_date,
  expected_date date,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  supplier_reference text not null default '' check (char_length(supplier_reference) <= 100),
  notes text not null default '' check (char_length(notes) <= 2000),
  subtotal numeric(18,4) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,4) not null default 0 check (tax_total >= 0),
  total numeric(18,4) not null default 0 check (total >= 0),
  approval_request_id uuid,
  rejected_reason text not null default '' check (char_length(rejected_reason) <= 300),
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (expected_date is null or expected_date >= order_date)
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  position integer not null check (position between 1 and 200),
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  description text not null default '' check (char_length(description) <= 300),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  line_total numeric(18,4) not null check (line_total >= 0),
  received_qty numeric(18,4) not null default 0 check (received_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (received_qty <= quantity)
);

select public.apply_standard_triggers('public.suppliers');
select public.apply_standard_triggers('public.purchase_orders');
select public.apply_standard_triggers('public.purchase_order_lines');
select public.rls_enable_default_deny('public.suppliers');
select public.rls_enable_default_deny('public.purchase_orders');
select public.rls_enable_default_deny('public.purchase_order_lines');
select public.audit_enable_for('public.suppliers');
select public.audit_enable_for('public.purchase_orders');
select public.audit_enable_for('public.purchase_order_lines');
revoke all on public.suppliers, public.purchase_orders, public.purchase_order_lines from authenticated;
grant all on public.suppliers, public.purchase_orders, public.purchase_order_lines to service_role;

create index if not exists ix_suppliers_company_name on public.suppliers (company_id, lower(name)) where deleted_at is null;
create index if not exists ix_suppliers_name_trgm on public.suppliers using gin (lower(name) extensions.gin_trgm_ops) where deleted_at is null;
create unique index if not exists uq_purchase_order_number on public.purchase_orders (company_id, number) where deleted_at is null;
create index if not exists ix_purchase_orders_company on public.purchase_orders (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_purchase_orders_supplier on public.purchase_orders (supplier_id) where deleted_at is null;
create index if not exists ix_purchase_orders_wait on public.purchase_orders (status) where status = 'pending_approval' and deleted_at is null;
create unique index if not exists uq_po_line on public.purchase_order_lines (purchase_order_id, position) where deleted_at is null;


-- One page of suppliers by name. Search matches name, contact, e-mail and tax number, with typo tolerance on the name.
create or replace function public.kd_supplier_search(p_company uuid, p_q text, p_status text, p_category text, p_after_value text, p_after_id uuid, p_limit integer)
returns table (id uuid, sort_value text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  q text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then p_limit := 25; end if;
  if q is not null then pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
    select s.id, lower(s.name)
      from public.suppliers s
     where s.company_id = p_company and s.deleted_at is null
       and (p_status is null or s.status = p_status)
       and (p_category is null or lower(s.category) = lower(p_category))
       and (q is null or lower(s.name) like pat or lower(s.contact_name) like pat or lower(coalesce(s.email, '')) like pat or lower(s.tax_id) like pat
            or similarity(lower(s.name), lower(q)) > 0.3)
       and (p_after_value is null or (lower(s.name), s.id) > (p_after_value, p_after_id))
     order by lower(s.name), s.id
     limit p_limit;
end
$$;

-- Receives goods against a purchase order in one step: checks each line (never more than ordered), writes a posted
-- "goods received" document with the lines (cost, batch, expiry), adds the stock, and moves the order to partial or
-- received. p_lines: [{lineId, quantity, batchNo, expiresOn}]. Raises 22023 for a bad order, line or quantity.
create or replace function public.kd_po_receive(p_company uuid, p_po uuid, p_lines jsonb, p_by uuid, p_number text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  po public.purchase_orders%rowtype;
  sup public.suppliers%rowtype;
  l public.purchase_order_lines%rowtype;
  e jsonb;
  doc uuid;
  qty numeric;
  pos integer := 0;
  open_left numeric;
  alerts jsonb;
begin
  select * into po from public.purchase_orders where id = p_po and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'order not found' using errcode = '22023'; end if;
  if po.status not in ('approved', 'sent', 'partial') then raise exception 'order cannot be received in this state' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then raise exception 'line list is not valid' using errcode = '22023'; end if;
  select * into sup from public.suppliers where id = po.supplier_id;
  insert into public.inventory_documents (company_id, kind, number, warehouse_id, party_type, party_id, party_name, reference, created_by)
  values (p_company, 'receipt', p_number, po.warehouse_id, 'supplier', po.supplier_id, sup.name, po.number, p_by) returning id into doc;
  for e in select * from jsonb_array_elements(p_lines) loop
    select * into l from public.purchase_order_lines where id = (e ->> 'lineId')::uuid and purchase_order_id = p_po and deleted_at is null for update;
    if not found then raise exception 'line not found' using errcode = '22023'; end if;
    qty := (e ->> 'quantity')::numeric;
    if qty is null or qty <= 0 or l.received_qty + qty > l.quantity then raise exception 'quantity is more than is still open' using errcode = '22023'; end if;
    pos := pos + 1;
    insert into public.inventory_document_lines (company_id, document_id, position, product_id, variant_id, quantity, unit_cost, batch_no, expires_on)
    values (p_company, doc, pos, l.product_id, l.variant_id, qty, l.unit_cost, nullif(e ->> 'batchNo', ''), nullif(e ->> 'expiresOn', '')::date);
    update public.purchase_order_lines set received_qty = received_qty + qty where id = l.id;
  end loop;
  alerts := public.kd_inventory_document_post(p_company, doc, p_by);
  select coalesce(sum(quantity - received_qty), 0) into open_left from public.purchase_order_lines where purchase_order_id = p_po and deleted_at is null;
  update public.purchase_orders set status = case when open_left = 0 then 'received' else 'partial' end where id = p_po;
  return jsonb_build_object('documentId', doc, 'alerts', alerts, 'status', case when open_left = 0 then 'received' else 'partial' end);
end
$$;
revoke all on function public.kd_supplier_search(uuid, text, text, text, text, uuid, integer), public.kd_po_receive(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_supplier_search(uuid, text, text, text, text, uuid, integer), public.kd_po_receive(uuid, uuid, jsonb, uuid, text) to service_role;
