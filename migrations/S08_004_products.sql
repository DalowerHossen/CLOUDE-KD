-- path: migrations/S08_004_products.sql
-- STEP 08.4 Products and services: the catalog, categories, variants, bundles and per-client prices. Prices are US
-- dollars in numeric(18,4); a tax rate is a percentage in numeric(7,4).

create table if not exists public.product_categories (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.products (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null default 'product' check (kind in ('product', 'service', 'bundle')),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9][A-Za-z0-9._\-/]{0,39}$'),
  barcode text check (barcode is null or barcode ~ '^[0-9A-Za-z\-]{4,32}$'),
  unit text not null default 'unit' check (unit ~ '^[a-z][a-z0-9 ./-]{0,19}$'),
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  cost_price numeric(18,4) not null default 0 check (cost_price >= 0),
  tax_category text not null default 'standard' check (tax_category in ('standard', 'reduced', 'zero', 'exempt')),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  category_id uuid references public.product_categories (id) on delete restrict,
  hs_code text not null default '' check (hs_code ~ '^[0-9A-Za-z.\-]{0,20}$'),
  track_inventory boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  image_file_ids uuid[] not null default '{}' check (cardinality(image_file_ids) <= 5),
  volume_tiers jsonb not null default '[]' check (jsonb_typeof(volume_tiers) = 'array' and jsonb_array_length(volume_tiers) <= 10),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (not track_inventory or kind = 'product')
);

create table if not exists public.product_variants (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9][A-Za-z0-9._\-/]{0,39}$'),
  barcode text check (barcode is null or barcode ~ '^[0-9A-Za-z\-]{4,32}$'),
  unit_price numeric(18,4) check (unit_price is null or unit_price >= 0),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.product_bundle_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bundle_id uuid not null references public.products (id) on delete restrict,
  item_product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (bundle_id <> item_product_id)
);

create table if not exists public.client_prices (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  unit_price numeric(18,4) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.product_categories');
select public.rls_enable_default_deny('public.product_categories');
select public.audit_enable_for('public.product_categories');
select public.apply_standard_triggers('public.products');
select public.rls_enable_default_deny('public.products');
select public.audit_enable_for('public.products');
select public.apply_standard_triggers('public.product_variants');
select public.rls_enable_default_deny('public.product_variants');
select public.audit_enable_for('public.product_variants');
select public.apply_standard_triggers('public.product_bundle_items');
select public.rls_enable_default_deny('public.product_bundle_items');
select public.audit_enable_for('public.product_bundle_items');
select public.apply_standard_triggers('public.client_prices');
select public.rls_enable_default_deny('public.client_prices');
select public.audit_enable_for('public.client_prices');

revoke all on public.product_categories, public.products, public.product_variants, public.product_bundle_items, public.client_prices from authenticated;
grant all on public.product_categories, public.products, public.product_variants, public.product_bundle_items, public.client_prices to service_role;

create unique index if not exists uq_product_category_name on public.product_categories (company_id, lower(name)) where deleted_at is null;
create unique index if not exists uq_product_sku on public.products (company_id, lower(sku)) where deleted_at is null and sku is not null;
create unique index if not exists uq_product_barcode on public.products (company_id, barcode) where deleted_at is null and barcode is not null;
create unique index if not exists uq_variant_sku on public.product_variants (company_id, lower(sku)) where deleted_at is null and sku is not null;
create unique index if not exists uq_variant_barcode on public.product_variants (company_id, barcode) where deleted_at is null and barcode is not null;
create unique index if not exists uq_bundle_item on public.product_bundle_items (bundle_id, item_product_id) where deleted_at is null;
create unique index if not exists uq_client_price on public.client_prices (client_id, product_id) where deleted_at is null;
create index if not exists ix_products_company_name on public.products (company_id, lower(name)) where deleted_at is null;
create index if not exists ix_products_name_trgm on public.products using gin (lower(name) extensions.gin_trgm_ops) where deleted_at is null;
create index if not exists ix_products_category on public.products (company_id, category_id) where deleted_at is null;
create index if not exists ix_variants_product on public.product_variants (product_id) where deleted_at is null;
create index if not exists ix_bundle_items_bundle on public.product_bundle_items (bundle_id) where deleted_at is null;

-- A bundle holds products and services, never another bundle, and only a bundle has items.
create or replace function public.kd_check_bundle_item() returns trigger
language plpgsql
set search_path = public
as $$
declare b text; i text; same_company boolean;
begin
  select kind into b from public.products where id = new.bundle_id;
  select kind, company_id = new.company_id into i, same_company from public.products where id = new.item_product_id;
  if b is distinct from 'bundle' then raise exception 'only a bundle has items' using errcode = '22023'; end if;
  if i is null or i = 'bundle' then raise exception 'a bundle cannot hold a bundle' using errcode = '22023'; end if;
  if not same_company then raise exception 'item belongs to another company' using errcode = '22023'; end if;
  return new;
end
$$;
drop trigger if exists trg_bundle_item_check on public.product_bundle_items;
create trigger trg_bundle_item_check before insert or update on public.product_bundle_items
  for each row execute function public.kd_check_bundle_item();

-- Replaces the items of one bundle in one step. p_rows: [{productId, quantity}, ...].
create or replace function public.kd_bundle_items_replace(p_company uuid, p_bundle uuid, p_rows jsonb) returns integer
language plpgsql security definer
set search_path = public
as $$
declare r jsonb; n integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30 then
    raise exception 'item list is not valid' using errcode = '22023';
  end if;
  perform 1 from public.products where id = p_bundle and company_id = p_company and kind = 'bundle' and deleted_at is null for update;
  if not found then raise exception 'bundle not found' using errcode = '22023'; end if;
  update public.product_bundle_items set deleted_at = now() where bundle_id = p_bundle and deleted_at is null;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.product_bundle_items (company_id, bundle_id, item_product_id, quantity)
    values (p_company, p_bundle, (r ->> 'productId')::uuid, (r ->> 'quantity')::numeric);
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.kd_bundle_items_replace(uuid, uuid, jsonb), public.kd_check_bundle_item() from public, anon, authenticated;
grant execute on function public.kd_bundle_items_replace(uuid, uuid, jsonb) to service_role;

-- Products that look like the given name, SKU or barcode.
create or replace function public.kd_product_duplicates(p_company uuid, p_name text, p_sku text, p_barcode text, p_exclude uuid) returns table (id uuid, name text, sku text, reason text, score numeric)
language sql stable security definer
set search_path = public, extensions
as $$
  select p.id, p.name, p.sku,
         case when p_sku is not null and p_sku <> '' and lower(p.sku) = lower(p_sku) then 'sku'
              when p_barcode is not null and p_barcode <> '' and p.barcode = p_barcode then 'barcode'
              else 'name' end,
         case when (p_sku is not null and p_sku <> '' and lower(p.sku) = lower(p_sku)) or (p_barcode is not null and p_barcode <> '' and p.barcode = p_barcode) then 1::numeric
              else similarity(lower(p.name), lower(p_name))::numeric end
    from public.products p
   where p.company_id = p_company and p.deleted_at is null and (p_exclude is null or p.id <> p_exclude)
     and ((p_sku is not null and p_sku <> '' and lower(p.sku) = lower(p_sku))
       or (p_barcode is not null and p_barcode <> '' and p.barcode = p_barcode)
       or similarity(lower(p.name), lower(p_name)) >= 0.6)
   order by 5 desc, p.name
   limit 10
$$;
revoke all on function public.kd_product_duplicates(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.kd_product_duplicates(uuid, text, text, text, uuid) to service_role;

-- One page of the product list. Sorting: name, created, price. The cursor is the last row's sort value (text) and id.
create or replace function public.kd_product_search(
  p_company uuid, p_q text, p_status text, p_kind text, p_category uuid, p_min numeric, p_max numeric,
  p_sort text, p_desc boolean, p_after_value text, p_after_id uuid, p_limit integer
) returns table (id uuid, sort_value text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  expr text;
  typ text;
  dir text := case when p_desc then 'desc' else 'asc' end;
  cmp text := case when p_desc then '<' else '>' end;
  q text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
  sql text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then p_limit := 25; end if;
  case p_sort
    when 'created' then expr := 'p.created_at'; typ := 'timestamptz';
    when 'price' then expr := 'p.unit_price'; typ := 'numeric';
    else expr := 'lower(p.name)'; typ := 'text';
  end case;
  if q is not null then
    pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  sql := format(
    'select p.id, (%1$s)::text from public.products p where p.company_id = $1 and p.deleted_at is null
       and ($2::text is null or p.status = $2) and ($3::text is null or p.kind = $3) and ($4::uuid is null or p.category_id = $4)
       and ($5::numeric is null or p.unit_price >= $5) and ($6::numeric is null or p.unit_price <= $6)
       and ($7::text is null or lower(p.name) like $8 or lower(coalesce(p.sku, '''')) like $8 or coalesce(p.barcode, '''') like $8
            or lower(p.description) like $8 or similarity(lower(p.name), lower($7)) > 0.3)
       and ($9::text is null or ((%1$s), p.id) %2$s (($9)::%3$s, $10))
     order by (%1$s) %4$s, p.id %4$s limit $11',
    expr, cmp, typ, dir);
  return query execute sql using p_company, p_status, p_kind, p_category, p_min, p_max, q, pat, p_after_value, p_after_id, p_limit;
end
$$;
revoke all on function public.kd_product_search(uuid, text, text, text, uuid, numeric, numeric, text, boolean, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.kd_product_search(uuid, text, text, text, uuid, numeric, numeric, text, boolean, text, uuid, integer) to service_role;
