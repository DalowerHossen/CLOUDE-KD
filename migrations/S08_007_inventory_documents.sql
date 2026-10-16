-- path: migrations/S08_007_inventory_documents.sql
-- STEP 08.6b Inventory documents (receipts, issues, returns, packing slips, delivery notes) and stock counts.
-- Posting a document moves stock in one step through the stock function; a count sets the counted quantities.

create table if not exists public.inventory_documents (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null check (kind in ('receipt', 'issue', 'sales_return', 'purchase_return', 'packing_slip', 'delivery_note')),
  number text not null check (char_length(number) between 3 and 30),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  party_type text not null default 'none' check (party_type in ('none', 'client', 'supplier')),
  party_id uuid,
  party_name text not null default '' check (char_length(party_name) <= 200),
  reference text not null default '' check (char_length(reference) <= 100),
  note text not null default '' check (char_length(note) <= 1000),
  posted_at timestamptz,
  created_by uuid,
  posted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status <> 'posted' or posted_at is not null)
);

create table if not exists public.inventory_document_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  document_id uuid not null references public.inventory_documents (id) on delete restrict,
  position integer not null check (position between 1 and 200),
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) check (unit_cost is null or unit_cost >= 0),
  batch_no text check (batch_no is null or batch_no ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  expires_on date,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.stock_counts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  number text not null check (char_length(number) between 3 and 30),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  note text not null default '' check (char_length(note) <= 500),
  started_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.stock_count_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  count_id uuid not null references public.stock_counts (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  expected_qty numeric(18,4) not null check (expected_qty >= 0),
  counted_qty numeric(18,4) check (counted_qty is null or counted_qty >= 0),
  applied_delta numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.inventory_documents');
select public.apply_standard_triggers('public.inventory_document_lines');
select public.apply_standard_triggers('public.stock_counts');
select public.apply_standard_triggers('public.stock_count_lines');
select public.rls_enable_default_deny('public.inventory_documents');
select public.rls_enable_default_deny('public.inventory_document_lines');
select public.rls_enable_default_deny('public.stock_counts');
select public.rls_enable_default_deny('public.stock_count_lines');
select public.audit_enable_for('public.inventory_documents');
select public.audit_enable_for('public.inventory_document_lines');
select public.audit_enable_for('public.stock_counts');
select public.audit_enable_for('public.stock_count_lines');
revoke all on public.inventory_documents, public.inventory_document_lines, public.stock_counts, public.stock_count_lines from authenticated;
grant all on public.inventory_documents, public.inventory_document_lines, public.stock_counts, public.stock_count_lines to service_role;

create unique index if not exists uq_inventory_document_number on public.inventory_documents (company_id, number) where deleted_at is null;
create index if not exists ix_inventory_documents_company on public.inventory_documents (company_id, created_at desc) where deleted_at is null;
create unique index if not exists uq_inventory_document_line on public.inventory_document_lines (document_id, position) where deleted_at is null;
create unique index if not exists uq_stock_count_number on public.stock_counts (company_id, number) where deleted_at is null;
create unique index if not exists uq_stock_count_open on public.stock_counts (warehouse_id) where status = 'open' and deleted_at is null;
create unique index if not exists uq_stock_count_line on public.stock_count_lines (count_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;

-- Posts a draft document. Receipt and sales return add stock; issue and purchase return take it; packing slip and
-- delivery note only become final. All lines succeed or none does (KD001 when stock is short). Returns the alerts raised.
create or replace function public.kd_inventory_document_post(p_company uuid, p_doc uuid, p_by uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.inventory_documents%rowtype;
  l record;
  r record;
  alerts jsonb := '[]'::jsonb;
  stock_kind text;
  sign integer;
begin
  select * into d from public.inventory_documents where id = p_doc and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'document not found' using errcode = '22023'; end if;
  if d.status <> 'draft' then raise exception 'document is not a draft' using errcode = '22023'; end if;
  if not exists (select 1 from public.inventory_document_lines where document_id = p_doc and deleted_at is null) then
    raise exception 'document has no lines' using errcode = '22023';
  end if;
  if d.kind in ('receipt', 'sales_return', 'issue', 'purchase_return') then
    stock_kind := case d.kind when 'receipt' then 'receipt' when 'sales_return' then 'return_in' when 'issue' then 'issue' else 'return_out' end;
    sign := case when d.kind in ('receipt', 'sales_return') then 1 else -1 end;
    for l in
      select * from public.inventory_document_lines where document_id = p_doc and deleted_at is null order by product_id, variant_id nulls first, position
    loop
      select * into r from public.kd_stock_apply(p_company, l.product_id, l.variant_id, d.warehouse_id, sign * l.quantity, null, stock_kind, null, 'inventory_document', p_doc,
        d.number, p_by, 'doc:' || p_doc || ':' || l.position, l.unit_cost, l.batch_no, l.expires_on, null);
      if r.alert is not null then alerts := alerts || jsonb_build_array(jsonb_build_object('productId', l.product_id, 'state', r.alert)); end if;
    end loop;
  end if;
  update public.inventory_documents set status = 'posted', posted_at = now(), posted_by = p_by where id = p_doc;
  return alerts;
end
$$;

-- Starts a count of one warehouse: every tracked item with a stock level there becomes a line with its expected quantity.
create or replace function public.kd_stock_count_start(p_company uuid, p_warehouse uuid, p_number text, p_by uuid, p_note text) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare c uuid;
begin
  perform 1 from public.warehouses where id = p_warehouse and company_id = p_company and deleted_at is null and is_active;
  if not found then raise exception 'warehouse not found' using errcode = '22023'; end if;
  insert into public.stock_counts (company_id, warehouse_id, number, note, started_by) values (p_company, p_warehouse, p_number, coalesce(p_note, ''), p_by) returning id into c;
  insert into public.stock_count_lines (company_id, count_id, product_id, variant_id, expected_qty)
  select p_company, c, l.product_id, l.variant_id, l.quantity
    from public.stock_levels l join public.products p on p.id = l.product_id and p.deleted_at is null and p.track_inventory
   where l.warehouse_id = p_warehouse and l.company_id = p_company and l.deleted_at is null;
  return c;
end
$$;

-- Completes a count: counted lines are set as the new stock (the change is computed under the lock, so sales during
-- the count are not lost), uncounted lines are left alone. Returns the number of lines that changed.
create or replace function public.kd_stock_count_complete(p_company uuid, p_count uuid, p_by uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.stock_counts%rowtype;
  l record;
  r record;
  changed integer := 0;
  alerts jsonb := '[]'::jsonb;
begin
  select * into c from public.stock_counts where id = p_count and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'count not found' using errcode = '22023'; end if;
  if c.status <> 'open' then raise exception 'count is not open' using errcode = '22023'; end if;
  for l in select * from public.stock_count_lines where count_id = p_count and counted_qty is not null and deleted_at is null order by product_id, variant_id nulls first loop
    select * into r from public.kd_stock_apply(p_company, l.product_id, l.variant_id, c.warehouse_id, null, l.counted_qty, 'count', 'correction', 'stock_count', p_count,
      c.number, p_by, 'count:' || p_count || ':' || l.id, null, null, null, null);
    update public.stock_count_lines set applied_delta = coalesce(r.applied, 0) where id = l.id;
    if coalesce(r.applied, 0) <> 0 then changed := changed + 1; end if;
    if r.alert is not null then alerts := alerts || jsonb_build_array(jsonb_build_object('productId', l.product_id, 'state', r.alert)); end if;
  end loop;
  update public.stock_counts set status = 'completed', completed_at = now() where id = p_count;
  return jsonb_build_object('changed', changed, 'alerts', alerts);
end
$$;
revoke all on function public.kd_inventory_document_post(uuid, uuid, uuid), public.kd_stock_count_start(uuid, uuid, text, uuid, text), public.kd_stock_count_complete(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.kd_inventory_document_post(uuid, uuid, uuid), public.kd_stock_count_start(uuid, uuid, text, uuid, text), public.kd_stock_count_complete(uuid, uuid, uuid) to service_role;
