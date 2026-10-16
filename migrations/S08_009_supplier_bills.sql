-- path: migrations/S08_009_supplier_bills.sql
-- STEP 08.8 Supplier bills, supplier remittances (money paid to suppliers) and the three-way match.
-- Money is US dollars in numeric(18,4); a tax rate is a percentage.

create table if not exists public.supplier_bills (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  number text not null check (char_length(number) between 3 and 30),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  supplier_invoice_no text not null default '' check (char_length(supplier_invoice_no) <= 60),
  bill_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'open', 'partial', 'paid', 'void')),
  subtotal numeric(18,4) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,4) not null default 0 check (tax_total >= 0),
  total numeric(18,4) not null default 0 check (total >= 0),
  paid_total numeric(18,4) not null default 0 check (paid_total >= 0),
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'matched', 'mismatch', 'overridden')),
  match_note text not null default '' check (char_length(match_note) <= 500),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (due_date >= bill_date),
  check (paid_total <= total)
);

create table if not exists public.supplier_bill_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bill_id uuid not null references public.supplier_bills (id) on delete restrict,
  position integer not null check (position between 1 and 200),
  po_line_id uuid references public.purchase_order_lines (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  description text not null default '' check (char_length(description) <= 300),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  line_total numeric(18,4) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (product_id is not null or char_length(description) > 0)
);

create table if not exists public.supplier_remittances (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  number text not null check (char_length(number) between 3 and 30),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'cash', 'card', 'cheque', 'other')),
  reference text not null default '' check (char_length(reference) <= 100),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  status text not null default 'posted' check (status in ('posted', 'void')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.supplier_remittance_allocations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  remittance_id uuid not null references public.supplier_remittances (id) on delete restrict,
  bill_id uuid not null references public.supplier_bills (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.supplier_bills');
select public.apply_standard_triggers('public.supplier_bill_lines');
select public.apply_standard_triggers('public.supplier_remittances');
select public.apply_standard_triggers('public.supplier_remittance_allocations');
select public.rls_enable_default_deny('public.supplier_bills');
select public.rls_enable_default_deny('public.supplier_bill_lines');
select public.rls_enable_default_deny('public.supplier_remittances');
select public.rls_enable_default_deny('public.supplier_remittance_allocations');
select public.audit_enable_for('public.supplier_bills');
select public.audit_enable_for('public.supplier_bill_lines');
select public.audit_enable_for('public.supplier_remittances');
select public.audit_enable_for('public.supplier_remittance_allocations');
revoke all on public.supplier_bills, public.supplier_bill_lines, public.supplier_remittances, public.supplier_remittance_allocations from authenticated;
grant all on public.supplier_bills, public.supplier_bill_lines, public.supplier_remittances, public.supplier_remittance_allocations to service_role;

create unique index if not exists uq_supplier_bill_number on public.supplier_bills (company_id, number) where deleted_at is null;
create index if not exists ix_supplier_bills_company on public.supplier_bills (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_supplier_bills_supplier on public.supplier_bills (supplier_id, due_date) where deleted_at is null;
create index if not exists ix_supplier_bills_po on public.supplier_bills (purchase_order_id) where purchase_order_id is not null and deleted_at is null;
create unique index if not exists uq_supplier_bill_line on public.supplier_bill_lines (bill_id, position) where deleted_at is null;
create index if not exists ix_supplier_bill_lines_po_line on public.supplier_bill_lines (po_line_id) where po_line_id is not null and deleted_at is null;
create unique index if not exists uq_supplier_remittance_number on public.supplier_remittances (company_id, number) where deleted_at is null;
create unique index if not exists uq_supplier_remittance_key on public.supplier_remittances (company_id, idempotency_key);
create index if not exists ix_supplier_remittances_supplier on public.supplier_remittances (supplier_id, paid_on desc) where deleted_at is null;
create index if not exists ix_remittance_alloc_bill on public.supplier_remittance_allocations (bill_id) where deleted_at is null;
create index if not exists ix_remittance_alloc_remittance on public.supplier_remittance_allocations (remittance_id) where deleted_at is null;

-- Posts a draft bill. The three-way match compares each bill line that points at an order line with the order and the
-- goods received: the quantity billed so far (this bill and earlier open bills) must not exceed what has arrived, and
-- the unit cost must be within one percent of the order. A bill that fails stays a draft unless p_override is true.
create or replace function public.kd_bill_post(p_company uuid, p_bill uuid, p_override boolean) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b public.supplier_bills%rowtype;
  l public.supplier_bill_lines%rowtype;
  pl public.purchase_order_lines%rowtype;
  billed numeric;
  note text := '';
  linked integer := 0;
  result text;
begin
  select * into b from public.supplier_bills where id = p_bill and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'bill not found' using errcode = '22023'; end if;
  if b.status <> 'draft' then raise exception 'only a draft bill can be posted' using errcode = '22023'; end if;
  if b.total <= 0 then raise exception 'a bill needs a total above zero' using errcode = '22023'; end if;
  for l in select * from public.supplier_bill_lines where bill_id = p_bill and deleted_at is null order by position loop
    if l.po_line_id is null then continue; end if;
    linked := linked + 1;
    select * into pl from public.purchase_order_lines where id = l.po_line_id and company_id = p_company and deleted_at is null for update;
    if not found or pl.purchase_order_id is distinct from b.purchase_order_id then raise exception 'line does not belong to the order' using errcode = '22023'; end if;
    select coalesce(sum(x.quantity), 0) into billed
      from public.supplier_bill_lines x join public.supplier_bills y on y.id = x.bill_id
     where x.po_line_id = l.po_line_id and x.deleted_at is null and y.deleted_at is null
       and y.status in ('open', 'partial', 'paid') and y.id <> p_bill;
    if billed + l.quantity > pl.received_qty then
      note := left(note || 'Line ' || l.position || ': billed ' || (billed + l.quantity)::text || ' but received ' || pl.received_qty::text || '. ', 500);
    end if;
    if abs(l.unit_cost - pl.unit_cost) > pl.unit_cost * 0.01 then
      note := left(note || 'Line ' || l.position || ': cost ' || l.unit_cost::text || ' differs from order ' || pl.unit_cost::text || '. ', 500);
    end if;
  end loop;
  if linked = 0 then result := 'unmatched';
  elsif note = '' then result := 'matched';
  elsif p_override then result := 'overridden';
  else result := 'mismatch';
  end if;
  if result = 'mismatch' then
    update public.supplier_bills set match_status = 'mismatch', match_note = note where id = p_bill;
    return jsonb_build_object('posted', false, 'matchStatus', 'mismatch', 'note', note);
  end if;
  update public.supplier_bills set status = 'open', match_status = result, match_note = note where id = p_bill;
  return jsonb_build_object('posted', true, 'matchStatus', result, 'note', note);
end
$$;

-- Pays one or more open bills of a supplier. p_allocations: [{billId, amount}], the amounts must add up to p_amount
-- and none may exceed what the bill still owes. A repeat with the same key returns the first result and changes nothing.
create or replace function public.kd_supplier_remit(p_company uuid, p_supplier uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text, p_key text, p_allocations jsonb, p_by uuid, p_number text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r public.supplier_remittances%rowtype;
  e jsonb;
  b public.supplier_bills%rowtype;
  amt numeric;
  sum_alloc numeric := 0;
  id_new uuid;
  ids uuid[];
begin
  select * into r from public.supplier_remittances where company_id = p_company and idempotency_key = p_key;
  if found then
    return jsonb_build_object('id', r.id, 'number', r.number, 'replayed', true);
  end if;
  perform 1 from public.suppliers where id = p_supplier and company_id = p_company and deleted_at is null;
  if not found then raise exception 'supplier not found' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be above zero' using errcode = '22023'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 or jsonb_array_length(p_allocations) > 100 then
    raise exception 'allocation list is not valid' using errcode = '22023';
  end if;
  select array_agg((x ->> 'billId')::uuid order by (x ->> 'billId')::uuid) into ids from jsonb_array_elements(p_allocations) x;
  if (select count(distinct i) from unnest(ids) i) <> array_length(ids, 1) then raise exception 'a bill appears twice' using errcode = '22023'; end if;
  insert into public.supplier_remittances (company_id, number, supplier_id, amount, paid_on, method, reference, idempotency_key, created_by)
  values (p_company, p_number, p_supplier, p_amount, p_paid_on, p_method, p_reference, p_key, p_by) returning id into id_new;
  for b in select * from public.supplier_bills where id = any (ids) and company_id = p_company and deleted_at is null order by id for update loop
    select (x ->> 'amount')::numeric into amt from jsonb_array_elements(p_allocations) x where (x ->> 'billId')::uuid = b.id;
    if b.supplier_id <> p_supplier or b.status not in ('open', 'partial') then raise exception 'bill cannot be paid' using errcode = '22023'; end if;
    if amt is null or amt <= 0 or amt > b.total - b.paid_total then raise exception 'amount is more than the bill owes' using errcode = '22023'; end if;
    insert into public.supplier_remittance_allocations (company_id, remittance_id, bill_id, amount) values (p_company, id_new, b.id, amt);
    update public.supplier_bills set paid_total = paid_total + amt, status = case when paid_total + amt = total then 'paid' else 'partial' end where id = b.id;
    sum_alloc := sum_alloc + amt;
  end loop;
  if (select count(*) from public.supplier_remittance_allocations where remittance_id = id_new) <> array_length(ids, 1) then
    raise exception 'a bill was not found' using errcode = '22023';
  end if;
  if sum_alloc <> p_amount then raise exception 'allocations must add up to the amount' using errcode = '22023'; end if;
  return jsonb_build_object('id', id_new, 'number', p_number, 'replayed', false);
end
$$;

-- Cancels a posted remittance and gives the money back to the bills it paid.
create or replace function public.kd_supplier_remit_void(p_company uuid, p_remittance uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.supplier_remittances%rowtype;
  a public.supplier_remittance_allocations%rowtype;
begin
  select * into r from public.supplier_remittances where id = p_remittance and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'remittance not found' using errcode = '22023'; end if;
  if r.status <> 'posted' then raise exception 'remittance is already cancelled' using errcode = '22023'; end if;
  for a in select * from public.supplier_remittance_allocations where remittance_id = p_remittance and deleted_at is null order by bill_id loop
    update public.supplier_bills set paid_total = paid_total - a.amount,
      status = case when paid_total - a.amount = 0 then 'open' else 'partial' end
     where id = a.bill_id and status in ('partial', 'paid');
  end loop;
  update public.supplier_remittances set status = 'void' where id = p_remittance;
end
$$;

revoke all on function public.kd_bill_post(uuid, uuid, boolean), public.kd_supplier_remit(uuid, uuid, numeric, date, text, text, text, jsonb, uuid, text), public.kd_supplier_remit_void(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kd_bill_post(uuid, uuid, boolean), public.kd_supplier_remit(uuid, uuid, numeric, date, text, text, text, jsonb, uuid, text), public.kd_supplier_remit_void(uuid, uuid) to service_role;
