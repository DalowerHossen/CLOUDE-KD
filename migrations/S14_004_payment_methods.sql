-- path: migrations/S14_004_payment_methods.sql
-- STEP 14.4 Local payment methods.
--   payment_method_settings  one row per method and scope. company_id null is the platform team's setting (the country
--                            column null means "every country of the catalogue"); a company row is the owner's own choice
--                            among the methods the platform switched on.

create table if not exists public.payment_method_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  method_code text not null check (method_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  enabled boolean not null default false,
  sort_order integer check (sort_order is null or sort_order between 0 and 1000),
  fee_model jsonb check (fee_model is null or jsonb_typeof(fee_model) = 'object'),
  instructions text check (instructions is null or char_length(instructions) <= 500),
  min_plan text check (min_plan is null or public.is_snake_token(min_plan)),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (company_id is null or (country is null and fee_model is null and min_plan is null))
);

select public.apply_standard_triggers('public.payment_method_settings');
select public.rls_enable_default_deny('public.payment_method_settings');
select public.audit_enable_for('public.payment_method_settings');

create unique index if not exists uq_payment_method_settings on public.payment_method_settings (
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), method_code, coalesce(country, '--')
) where deleted_at is null;
create index if not exists ix_payment_method_settings_company on public.payment_method_settings (company_id) where deleted_at is null;

grant all on public.payment_method_settings to service_role;
