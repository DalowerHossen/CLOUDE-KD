-- path: migrations/S16_036_retention.sql
-- STEP 16 Retention: the exit survey (why a company cancels or goes to a lower plan) and the offers the platform team shows
-- before they do. An offer points to an existing coupon code. Only the service role reads or writes.

create table if not exists public.retention_offers (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  trigger_kind text not null check (trigger_kind in ('cancel', 'downgrade')),
  reason_code text check (reason_code is null or reason_code in ('too_expensive', 'missing_feature', 'not_using', 'found_alternative', 'hard_to_use', 'support', 'other')),
  title text not null check (char_length(title) between 3 and 100),
  message text not null check (char_length(message) between 3 and 600),
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create index if not exists ix_retention_offers_active on public.retention_offers (trigger_kind, reason_code) where status = 'active' and deleted_at is null;

create table if not exists public.exit_surveys (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  trigger_kind text not null check (trigger_kind in ('cancel', 'downgrade')),
  reason_code text not null check (reason_code in ('too_expensive', 'missing_feature', 'not_using', 'found_alternative', 'hard_to_use', 'support', 'other')),
  detail text not null default '' check (char_length(detail) <= 500),
  plan_from text check (plan_from is null or char_length(plan_from) <= 40),
  plan_to text check (plan_to is null or char_length(plan_to) <= 40),
  offer_id uuid references public.retention_offers (id) on delete restrict,
  outcome text not null check (outcome in ('saved', 'continued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create index if not exists ix_exit_surveys_company on public.exit_surveys (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_exit_surveys_reason on public.exit_surveys (trigger_kind, reason_code, outcome) where deleted_at is null;

select public.apply_standard_triggers('public.retention_offers');
select public.apply_standard_triggers('public.exit_surveys');
select public.rls_enable_default_deny('public.retention_offers');
select public.rls_enable_default_deny('public.exit_surveys');
select public.audit_enable_for('public.retention_offers');
select public.audit_enable_for('public.exit_surveys');
revoke all on public.retention_offers, public.exit_surveys from authenticated;
grant all on public.retention_offers, public.exit_surveys to service_role;
