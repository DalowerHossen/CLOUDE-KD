-- path: migrations/S08_002_client_search.sql
-- STEP 08.2 Client search and views: balances kept for sorting, trigram search with keyset pages, saved views,
-- activity timeline, duplicate detection and the merge function.

alter table public.clients add column if not exists outstanding_balance numeric(18,4) not null default 0;
alter table public.clients add column if not exists overdue_balance numeric(18,4) not null default 0;
alter table public.clients add column if not exists last_invoice_at timestamptz;
alter table public.clients add column if not exists last_payment_at timestamptz;

create index if not exists ix_clients_name_trgm on public.clients using gin (lower(name) extensions.gin_trgm_ops) where deleted_at is null;
create index if not exists ix_clients_email_trgm on public.clients using gin (lower(email) extensions.gin_trgm_ops) where deleted_at is null and email is not null;
create index if not exists ix_clients_phone_trgm on public.clients using gin (phone extensions.gin_trgm_ops) where deleted_at is null and phone <> '';
create index if not exists ix_clients_balance on public.clients (company_id, outstanding_balance desc) where deleted_at is null;
create index if not exists ix_clients_last_invoice on public.clients (company_id, last_invoice_at desc nulls last) where deleted_at is null;

create table if not exists public.saved_views (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  list_key text not null check (list_key in ('clients', 'products', 'suppliers', 'purchase_orders')),
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.client_activity (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind text not null check (kind in ('note', 'call', 'meeting', 'email', 'status', 'merge', 'system')),
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 5000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (title <> '' or body <> '')
);

create table if not exists public.client_merges (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kept_client_id uuid not null references public.clients (id) on delete restrict,
  removed_client_id uuid not null references public.clients (id) on delete restrict,
  removed_snapshot jsonb not null,
  merged_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kept_client_id <> removed_client_id)
);

select public.apply_standard_triggers('public.saved_views');
select public.apply_standard_triggers('public.client_activity');
select public.apply_standard_triggers('public.client_merges');
select public.rls_enable_default_deny('public.saved_views');
select public.rls_enable_default_deny('public.client_activity');
select public.rls_enable_default_deny('public.client_merges');
select public.audit_enable_for('public.saved_views');
select public.audit_enable_for('public.client_activity');
select public.audit_enable_for('public.client_merges');

create unique index if not exists uq_saved_view_name on public.saved_views (user_id, list_key, lower(name)) where deleted_at is null;
create index if not exists ix_client_activity_client on public.client_activity (client_id, created_at desc) where deleted_at is null;
create index if not exists ix_client_merges_kept on public.client_merges (kept_client_id);

revoke all on public.saved_views, public.client_activity, public.client_merges from authenticated;
grant all on public.saved_views, public.client_activity, public.client_merges to service_role;

-- Sets the balances other STEPs know (invoices and payments). Called by the invoice and payment STEPs.
create or replace function public.kd_client_set_balances(p_company uuid, p_client uuid, p_outstanding numeric, p_overdue numeric, p_last_invoice timestamptz, p_last_payment timestamptz) returns void
language sql security definer
set search_path = public
as $$
  update public.clients
     set outstanding_balance = p_outstanding, overdue_balance = p_overdue,
         last_invoice_at = coalesce(p_last_invoice, last_invoice_at), last_payment_at = coalesce(p_last_payment, last_payment_at)
   where id = p_client and company_id = p_company and deleted_at is null
$$;

-- One page of the client list. Filters are optional. Sorting: name, created, balance, last_invoice. The page cursor is
-- the last row's sort value (as text) and id; rows come back in the requested order.
create or replace function public.kd_client_search(
  p_company uuid, p_q text, p_status text, p_tag text, p_country text, p_risk text, p_with_balance boolean,
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
    when 'created' then expr := 'c.created_at'; typ := 'timestamptz';
    when 'balance' then expr := 'c.outstanding_balance'; typ := 'numeric';
    when 'last_invoice' then expr := 'coalesce(c.last_invoice_at, ''epoch''::timestamptz)'; typ := 'timestamptz';
    else expr := 'lower(c.name)'; typ := 'text';
  end case;
  if q is not null then
    pat := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  sql := format(
    'select c.id, (%1$s)::text from public.clients c where c.company_id = $1 and c.deleted_at is null
       and ($2::text is null or c.status = $2) and ($3::text is null or $3 = any (c.tags))
       and ($4::text is null or c.billing_country = $4) and ($5::text is null or c.risk_flag = $5)
       and (not $6 or c.outstanding_balance > 0)
       and ($7::text is null or lower(c.name) like $8 or lower(coalesce(c.email, '''')) like $8 or c.phone like $8
            or lower(c.contact_name) like $8 or lower(c.tax_id) like $8 or similarity(lower(c.name), lower($7)) > 0.3)
       and ($9::text is null or ((%1$s), c.id) %2$s (($9)::%3$s, $10))
     order by (%1$s) %4$s, c.id %4$s limit $11',
    expr, cmp, typ, dir);
  return query execute sql using p_company, p_status, p_tag, p_country, p_risk, coalesce(p_with_balance, false), q, pat, p_after_value, p_after_id, p_limit;
end
$$;

-- Clients that look like the given name, e-mail or tax number. score: 1 = same e-mail or tax number, else name similarity.
create or replace function public.kd_client_duplicates(p_company uuid, p_name text, p_email text, p_tax_id text, p_exclude uuid) returns table (id uuid, name text, email text, reason text, score numeric)
language sql stable security definer
set search_path = public, extensions
as $$
  select c.id, c.name, c.email,
         case when p_email is not null and p_email <> '' and lower(c.email) = lower(p_email) then 'email'
              when p_tax_id is not null and p_tax_id <> '' and lower(c.tax_id) = lower(p_tax_id) then 'tax_id'
              else 'name' end,
         case when (p_email is not null and p_email <> '' and lower(c.email) = lower(p_email))
                or (p_tax_id is not null and p_tax_id <> '' and lower(c.tax_id) = lower(p_tax_id)) then 1::numeric
              else similarity(lower(c.name), lower(p_name))::numeric end
    from public.clients c
   where c.company_id = p_company and c.deleted_at is null and (p_exclude is null or c.id <> p_exclude)
     and ((p_email is not null and p_email <> '' and lower(c.email) = lower(p_email))
       or (p_tax_id is not null and p_tax_id <> '' and lower(c.tax_id) = lower(p_tax_id))
       or similarity(lower(c.name), lower(p_name)) >= 0.6)
   order by 5 desc, c.name
   limit 10
$$;

-- Pairs of clients that look like the same one (same e-mail, or very similar names). For the duplicate review page.
create or replace function public.kd_client_duplicate_pairs(p_company uuid, p_limit integer) returns table (a_id uuid, a_name text, b_id uuid, b_name text, reason text, score numeric)
language sql stable security definer
set search_path = public, extensions
as $$
  select a.id, a.name, b.id, b.name,
         case when a.email is not null and lower(a.email) = lower(b.email) then 'email' else 'name' end,
         case when a.email is not null and lower(a.email) = lower(b.email) then 1::numeric else similarity(lower(a.name), lower(b.name))::numeric end
    from public.clients a join public.clients b on b.company_id = a.company_id and b.id > a.id and b.deleted_at is null
   where a.company_id = p_company and a.deleted_at is null and b.deleted_at is null
     and a.anonymized_at is null and b.anonymized_at is null
     and ((a.email is not null and lower(a.email) = lower(b.email))
       or (lower(a.name) % lower(b.name) and similarity(lower(a.name), lower(b.name)) >= 0.6))
   order by 6 desc, a.name
   limit least(coalesce(p_limit, 50), 100)
$$;

-- Merges the client p_remove into p_keep in one step: empty fields of the kept client are filled from the removed one,
-- tags and contacts are combined, balances are added, the history moves over, and the removed client is soft deleted
-- with a snapshot kept in client_merges. Raises 22023 when a client is missing, anonymized, or both are the same.
create or replace function public.kd_client_merge(p_company uuid, p_keep uuid, p_remove uuid, p_by uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  k public.clients%rowtype;
  r public.clients%rowtype;
  first_id uuid := least(p_keep, p_remove);
  second_id uuid := greatest(p_keep, p_remove);
begin
  if p_keep = p_remove then raise exception 'same client' using errcode = '22023'; end if;
  perform 1 from public.clients where id = first_id and company_id = p_company and deleted_at is null for update;
  perform 1 from public.clients where id = second_id and company_id = p_company and deleted_at is null for update;
  select * into k from public.clients where id = p_keep and company_id = p_company and deleted_at is null;
  select * into r from public.clients where id = p_remove and company_id = p_company and deleted_at is null;
  if k.id is null or r.id is null then raise exception 'client not found' using errcode = '22023'; end if;
  if k.anonymized_at is not null or r.anonymized_at is not null then raise exception 'client is anonymized' using errcode = '22023'; end if;

  insert into public.client_merges (company_id, kept_client_id, removed_client_id, removed_snapshot, merged_by)
  values (p_company, p_keep, p_remove, to_jsonb(r) - 'company_id', p_by);

  update public.clients set
    contact_name = case when k.contact_name = '' then r.contact_name else k.contact_name end,
    email = coalesce(k.email, r.email),
    billing_email = coalesce(k.billing_email, r.billing_email),
    phone = case when k.phone = '' then r.phone else k.phone end,
    website = case when k.website = '' then r.website else k.website end,
    tax_id = case when k.tax_id = '' then r.tax_id else k.tax_id end,
    payment_terms_days = coalesce(k.payment_terms_days, r.payment_terms_days),
    notes = left(case when r.notes = '' then k.notes when k.notes = '' then r.notes else k.notes || E'\n---\n' || r.notes end, 5000),
    tags = (select coalesce(array_agg(distinct t), '{}') from unnest(k.tags || r.tags) as t),
    custom_fields = r.custom_fields || k.custom_fields,
    billing_line1 = case when k.billing_line1 = '' then r.billing_line1 else k.billing_line1 end,
    billing_city = case when k.billing_city = '' then r.billing_city else k.billing_city end,
    billing_postal_code = case when k.billing_postal_code = '' then r.billing_postal_code else k.billing_postal_code end,
    billing_country = coalesce(k.billing_country, r.billing_country),
    shipping_line1 = case when k.shipping_line1 = '' then r.shipping_line1 else k.shipping_line1 end,
    shipping_city = case when k.shipping_city = '' then r.shipping_city else k.shipping_city end,
    shipping_postal_code = case when k.shipping_postal_code = '' then r.shipping_postal_code else k.shipping_postal_code end,
    shipping_country = coalesce(k.shipping_country, r.shipping_country),
    opening_balance = k.opening_balance + r.opening_balance,
    credit_balance = k.credit_balance + r.credit_balance,
    outstanding_balance = k.outstanding_balance + r.outstanding_balance,
    overdue_balance = k.overdue_balance + r.overdue_balance,
    last_invoice_at = greatest(k.last_invoice_at, r.last_invoice_at),
    last_payment_at = greatest(k.last_payment_at, r.last_payment_at),
    risk_flag = case when 'high' in (k.risk_flag, r.risk_flag) then 'high' when 'watch' in (k.risk_flag, r.risk_flag) then 'watch' else 'none' end,
    do_not_contact = k.do_not_contact or r.do_not_contact,
    reminders_opt_out = k.reminders_opt_out or r.reminders_opt_out
  where id = p_keep;

  -- Contact people of the removed client that the kept client does not have yet (by e-mail or name), up to ten in all.
  update public.client_contacts c set client_id = p_keep, is_primary = false
   where c.client_id = p_remove and c.deleted_at is null
     and not exists (select 1 from public.client_contacts x where x.client_id = p_keep and x.deleted_at is null
                      and (lower(x.name) = lower(c.name) or (x.email is not null and x.email = c.email)))
     and (select count(*) from public.client_contacts x where x.client_id = p_keep and x.deleted_at is null) < 10;
  update public.client_contacts set deleted_at = now() where client_id = p_remove and deleted_at is null;

  update public.client_activity set client_id = p_keep where client_id = p_remove;
  insert into public.client_activity (company_id, client_id, kind, title, body, created_by)
  values (p_company, p_keep, 'merge', 'Clients merged', 'The client "' || r.name || '" was merged into this one.', p_by);

  update public.clients set deleted_at = now(), status = 'archived' where id = p_remove;
end
$$;

revoke all on function public.kd_client_set_balances(uuid, uuid, numeric, numeric, timestamptz, timestamptz),
  public.kd_client_search(uuid, text, text, text, text, text, boolean, text, boolean, text, uuid, integer),
  public.kd_client_duplicates(uuid, text, text, text, uuid), public.kd_client_duplicate_pairs(uuid, integer),
  public.kd_client_merge(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.kd_client_set_balances(uuid, uuid, numeric, numeric, timestamptz, timestamptz),
  public.kd_client_search(uuid, text, text, text, text, text, boolean, text, boolean, text, uuid, integer),
  public.kd_client_duplicates(uuid, text, text, text, uuid), public.kd_client_duplicate_pairs(uuid, integer),
  public.kd_client_merge(uuid, uuid, uuid, uuid) to service_role;
