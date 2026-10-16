-- path: migrations/S09_001_tax_fx.sql
-- STEP 09.2 Tax rates, tax settings, client tax exemptions and foreign exchange rates.
-- Money is US dollars in numeric(18,4); a tax rate is a percentage numeric(7,4); an exchange rate is units of the
-- display currency per one US dollar (numeric(20,8)). Historical invoices keep their own copy of rates.

create table if not exists public.tax_rates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_.-]{0,19}$'),
  name text not null check (char_length(name) between 1 and 80),
  rate numeric(7,4) not null check (rate between 0 and 100),
  kind text not null default 'sales' check (kind in ('sales', 'vat', 'gst', 'withholding', 'other')),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  region text not null default '' check (char_length(region) <= 60),
  compound boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  template text not null default '' check (char_length(template) <= 40),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.tax_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  price_mode text not null default 'exclusive' check (price_mode in ('exclusive', 'inclusive')),
  discount_order text not null default 'before_tax' check (discount_order in ('before_tax', 'after_tax')),
  rounding_policy text not null default 'per_line' check (rounding_policy in ('per_line', 'on_total')),
  rounding_mode text not null default 'half_up' check (rounding_mode in ('half_up', 'half_even')),
  precision smallint not null default 2 check (precision in (2, 3, 4)),
  cash_rounding text not null default '0' check (cash_rounding in ('0', '0.05', '0.10', '0.50', '1')),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  seller_tax_label text not null default '' check (char_length(seller_tax_label) <= 30),
  seller_tax_id text not null default '' check (char_length(seller_tax_id) <= 40),
  seller_country char(2) check (seller_country is null or seller_country ~ '^[A-Z]{2}$'),
  reverse_charge boolean not null default false,
  marketplace_facilitator boolean not null default false,
  nexus_regions text[] not null default '{}' check (cardinality(nexus_regions) <= 60),
  default_tax_codes text[] not null default '{}' check (cardinality(default_tax_codes) <= 5),
  default_withholding numeric(7,4) not null default 0 check (default_withholding between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.client_tax_exemptions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  tax_exempt boolean not null default false,
  reason text not null default '' check (char_length(reason) <= 300),
  certificate_file_id uuid,
  certificate_expires_on date,
  client_tax_id text not null default '' check (char_length(client_tax_id) <= 40),
  client_tax_label text not null default '' check (char_length(client_tax_label) <= 30),
  client_tax_id_checked_at timestamptz,
  client_tax_id_valid boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.fx_rates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$' and currency <> 'USD'),
  rate numeric(20,8) not null check (rate > 0),
  as_of date not null,
  source text not null default 'manual' check (source in ('manual', 'provider')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.tax_rates');
select public.apply_standard_triggers('public.tax_settings');
select public.apply_standard_triggers('public.client_tax_exemptions');
select public.apply_standard_triggers('public.fx_rates');
select public.rls_enable_default_deny('public.tax_rates');
select public.rls_enable_default_deny('public.tax_settings');
select public.rls_enable_default_deny('public.client_tax_exemptions');
select public.rls_enable_default_deny('public.fx_rates');
select public.audit_enable_for('public.tax_rates');
select public.audit_enable_for('public.tax_settings');
select public.audit_enable_for('public.client_tax_exemptions');
select public.audit_enable_for('public.fx_rates');
revoke all on public.tax_rates, public.tax_settings, public.client_tax_exemptions, public.fx_rates from authenticated;
grant all on public.tax_rates, public.tax_settings, public.client_tax_exemptions, public.fx_rates to service_role;

create unique index if not exists uq_tax_rate_code on public.tax_rates (company_id, code) where deleted_at is null;
create index if not exists ix_tax_rates_company on public.tax_rates (company_id, sort_order) where deleted_at is null;
create unique index if not exists uq_tax_settings_company on public.tax_settings (company_id) where deleted_at is null;
create unique index if not exists uq_client_tax_exemption on public.client_tax_exemptions (company_id, client_id) where deleted_at is null;
create unique index if not exists uq_fx_rate_day on public.fx_rates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), currency, as_of) where deleted_at is null;
create index if not exists ix_fx_rates_lookup on public.fx_rates (currency, as_of desc) where deleted_at is null;

-- The rate for a currency on or before a day: the company's own rate wins, else the platform rate. Null when none.
create or replace function public.kd_fx_rate(p_company uuid, p_currency text, p_at date) returns table (rate numeric, as_of date, source text)
language sql stable security definer
set search_path = public
as $$
  select f.rate, f.as_of, f.source
    from public.fx_rates f
   where f.currency = p_currency and f.deleted_at is null and f.as_of <= p_at
     and (f.company_id = p_company or f.company_id is null)
   order by f.as_of desc, (f.company_id is not null) desc
   limit 1
$$;
revoke all on function public.kd_fx_rate(uuid, text, date) from public, anon, authenticated;
grant execute on function public.kd_fx_rate(uuid, text, date) to service_role;
