-- path: migrations/S14_005_plans.sql
-- STEP 14.5 Plans and entitlements.
--   plans              the plans a company can be on. Prices are in USD. The four built-in slugs come from config/plans.ts
--                      (seeded by the service); the platform team can add more.
--   plan_entitlements  what a plan includes: a switch (true or false), a limit (a number) or unlimited (null), plus the
--                      price per unit above the limit (overage).
--   plan_history       who changed a plan and what changed (append only).
--   usage_counters     the use of a limited feature in a period (a month like 2026-10), kept for usage meters and for
--                      billing the part above the limit.

create table if not exists public.plans (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (public.is_snake_token(slug)),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  price_monthly numeric(18,4) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(18,4) not null default 0 check (price_yearly >= 0),
  seat_price_monthly numeric(18,4) not null default 0 check (seat_price_monthly >= 0),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  visible boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 1000),
  badge text check (badge is null or char_length(badge) between 1 and 30),
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.plan_entitlements (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  entitlement_key text not null check (entitlement_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null check (jsonb_typeof(value) in ('boolean', 'number', 'null')),
  overage_price numeric(18,4) check (overage_price is null or overage_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (jsonb_typeof(value) <> 'number' or (value::text)::numeric >= 0)
);

create table if not exists public.plan_history (
  -- guard:append-only (the change log of a plan; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 60),
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entitlement_key text not null check (entitlement_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  period text not null check (period ~ '^(\d{4}-\d{2}|all)$'),
  used bigint not null default 0 check (used >= 0),
  limit_value bigint check (limit_value is null or limit_value >= 0),
  overage_units bigint not null default 0 check (overage_units >= 0),
  billed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.plans');
select public.apply_standard_triggers('public.plan_entitlements');
select public.apply_standard_triggers('public.usage_counters');
select public.rls_enable_default_deny('public.plans');
select public.rls_enable_default_deny('public.plan_entitlements');
select public.rls_enable_default_deny('public.plan_history');
select public.rls_enable_default_deny('public.usage_counters');
select public.audit_enable_for('public.plans');
select public.audit_enable_for('public.plan_entitlements');

drop trigger if exists trg_plan_history_append on public.plan_history;
create trigger trg_plan_history_append before update or delete on public.plan_history for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_plans_slug on public.plans (slug) where deleted_at is null;
create unique index if not exists uq_plan_entitlements on public.plan_entitlements (plan_id, entitlement_key) where deleted_at is null;
create index if not exists ix_plan_history_plan on public.plan_history (plan_id, created_at desc);
create unique index if not exists uq_usage_counters on public.usage_counters (company_id, entitlement_key, period) where deleted_at is null;
create index if not exists ix_usage_counters_unbilled on public.usage_counters (period) where overage_units > 0 and billed_at is null and deleted_at is null;

-- Adds to a counter in one step (safe when many requests arrive together) and says whether the limit still holds.
-- p_limit null means no limit. When p_enforce is true and the new total would pass the limit, nothing is added.
create or replace function public.kd_usage_add(p_company uuid, p_key text, p_period text, p_delta bigint, p_limit bigint, p_enforce boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
begin
  if p_delta is null or p_delta = 0 then raise exception 'the change must not be zero' using errcode = '22023'; end if;
  insert into public.usage_counters (company_id, entitlement_key, period, used, limit_value)
    values (p_company, p_key, p_period, 0, p_limit)
    on conflict (company_id, entitlement_key, period) where deleted_at is null do nothing;
  select used into v_used from public.usage_counters
    where company_id = p_company and entitlement_key = p_key and period = p_period and deleted_at is null for update;
  if p_enforce and p_limit is not null and p_delta > 0 and v_used + p_delta > p_limit then
    return jsonb_build_object('ok', false, 'used', v_used);
  end if;
  if v_used + p_delta < 0 then v_used := 0; else v_used := v_used + p_delta; end if;
  update public.usage_counters
    set used = v_used, limit_value = p_limit,
        overage_units = case when p_limit is null then 0 else greatest(v_used - p_limit, 0) end
    where company_id = p_company and entitlement_key = p_key and period = p_period and deleted_at is null;
  return jsonb_build_object('ok', true, 'used', v_used);
end
$$;

revoke execute on function public.kd_usage_add(uuid, text, text, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.kd_usage_add(uuid, text, text, bigint, bigint, boolean) to service_role;
grant all on public.plans, public.plan_entitlements, public.plan_history, public.usage_counters to service_role;
