-- path: migrations/S14_007_coupons.sql
-- STEP 14.7 Coupons for platform subscriptions.
--   coupons             a code with a discount (percent, fixed amount or extra trial days), limits and a plan restriction.
--   coupon_redemptions  a company using a coupon at checkout. The redemption function counts under a lock, so many
--                       companies at once can never pass the total limit, and a company can use a one-time coupon once.
--   coupon_attempts     failed codes tried by a company (a guard against guessing codes).
-- platform_invoices gets two columns: which redemption a discount came from, and how much was taken off.

create table if not exists public.coupons (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('percent', 'fixed', 'free_trial')),
  percent_off numeric(18,4) check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off numeric(18,4) check (amount_off is null or amount_off > 0),
  trial_days integer check (trial_days is null or trial_days between 1 and 365),
  cycles integer not null default 1 check (cycles between 1 and 36),
  plan_slugs text[] not null default '{}' check (cardinality(plan_slugs) <= 20),
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions between 1 and 1000000),
  once_per_company boolean not null default true,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((kind = 'percent') = (percent_off is not null)),
  check ((kind = 'fixed') = (amount_off is not null)),
  check ((kind = 'free_trial') = (trial_days is not null)),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  subscription_id uuid references public.platform_subscriptions (id) on delete restrict,
  plan_slug text not null check (public.is_snake_token(plan_slug)),
  invoices_allowed integer not null check (invoices_allowed between 1 and 36),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.coupon_attempts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

alter table public.platform_invoices add column if not exists coupon_redemption_id uuid references public.coupon_redemptions (id) on delete restrict;
alter table public.platform_invoices add column if not exists discount_amount numeric(18,4) not null default 0 check (discount_amount >= 0);

select public.apply_standard_triggers('public.coupons');
select public.apply_standard_triggers('public.coupon_redemptions');
select public.apply_standard_triggers('public.coupon_attempts');
select public.rls_enable_default_deny('public.coupons');
select public.rls_enable_default_deny('public.coupon_redemptions');
select public.rls_enable_default_deny('public.coupon_attempts');
select public.audit_enable_for('public.coupons');
select public.audit_enable_for('public.coupon_redemptions');

create unique index if not exists uq_coupons_code on public.coupons (code) where deleted_at is null;
create index if not exists ix_coupon_redemptions_coupon on public.coupon_redemptions (coupon_id, created_at desc) where deleted_at is null;
create index if not exists ix_coupon_redemptions_company on public.coupon_redemptions (company_id, coupon_id) where deleted_at is null;
create index if not exists ix_coupon_attempts on public.coupon_attempts (company_id, created_at desc);
create index if not exists ix_platform_invoices_coupon on public.platform_invoices (coupon_redemption_id) where coupon_redemption_id is not null;

-- Uses a coupon for a company. One step under a lock on the coupon. Answers { ok: true, ... } or { ok: false, error }.
-- The errors are plain: invalid, disabled, not_started, expired, wrong_plan, used_up, already_used.
create or replace function public.kd_coupon_redeem(p_code text, p_company uuid, p_subscription uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coupons;
  v_used integer;
  v_red uuid;
begin
  select * into c from public.coupons where code = upper(trim(p_code)) and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if not c.enabled then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;
  if c.starts_at is not null and c.starts_at > now() then return jsonb_build_object('ok', false, 'error', 'not_started'); end if;
  if c.expires_at is not null and c.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if cardinality(c.plan_slugs) > 0 and not (p_plan = any (c.plan_slugs)) then return jsonb_build_object('ok', false, 'error', 'wrong_plan'); end if;
  if c.once_per_company and exists (select 1 from public.coupon_redemptions r where r.coupon_id = c.id and r.company_id = p_company and r.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;
  select count(*) into v_used from public.coupon_redemptions r where r.coupon_id = c.id and r.deleted_at is null;
  if c.max_redemptions is not null and v_used >= c.max_redemptions then return jsonb_build_object('ok', false, 'error', 'used_up'); end if;
  insert into public.coupon_redemptions (company_id, coupon_id, subscription_id, plan_slug, invoices_allowed)
    values (p_company, c.id, p_subscription, p_plan, c.cycles) returning id into v_red;
  return jsonb_build_object('ok', true, 'redemption_id', v_red, 'coupon_id', c.id, 'code', c.code, 'name', c.name, 'kind', c.kind,
    'percent_off', c.percent_off, 'amount_off', c.amount_off, 'trial_days', c.trial_days, 'cycles', c.cycles);
end
$$;

revoke execute on function public.kd_coupon_redeem(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_coupon_redeem(text, uuid, uuid, text) to service_role;
grant all on public.coupons, public.coupon_redemptions, public.coupon_attempts to service_role;
