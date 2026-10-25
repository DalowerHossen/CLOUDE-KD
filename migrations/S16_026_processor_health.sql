-- path: migrations/S16_026_processor_health.sql
-- STEP 16 Processor health. A job checks every enabled payment processor every few minutes and keeps the history
-- (processor_health) and the current state (processor_health_state). A processor that fails the allowed number of checks in
-- a row is switched off by kd_processor_auto_disable. Both tables are platform level (no company).

create table if not exists public.processor_health (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id in ('stripe','nmi','adyen','verifone','braintree','bluesnap','square','payoneer','fastspring','paddle','payproglobal','paypal','payarc','rapyd','authorizenet','custom')),
  environment text not null check (environment in ('sandbox', 'live')),
  status text not null check (status in ('healthy', 'degraded', 'down', 'unknown')),
  probe text not null check (probe in ('url', 'adapter')),
  response_ms integer check (response_ms is null or response_ms >= 0),
  error_message text check (error_message is null or char_length(error_message) <= 300),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
select public.apply_standard_triggers('public.processor_health');
select public.rls_enable_default_deny('public.processor_health');
create index if not exists idx_processor_health_recent on public.processor_health (processor_id, checked_at desc) where deleted_at is null;

create table if not exists public.processor_health_state (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  processor_id text not null check (processor_id in ('stripe','nmi','adyen','verifone','braintree','bluesnap','square','payoneer','fastspring','paddle','payproglobal','paypal','payarc','rapyd','authorizenet','custom')),
  status text not null default 'unknown' check (status in ('healthy', 'degraded', 'down', 'unknown')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  probe text check (probe is null or probe in ('url', 'adapter')),
  response_ms integer check (response_ms is null or response_ms >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  auto_disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
select public.apply_standard_triggers('public.processor_health_state');
select public.rls_enable_default_deny('public.processor_health_state');
select public.create_live_unique_index('public.processor_health_state', 'processor_id');

-- Switches a processor off for the system. Returns true when it was on. The reason is shown in the dashboard.
create or replace function public.kd_processor_auto_disable(p_processor text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.processors
    set enabled = false, disabled_reason = left(p_reason, 200)
    where processor_id = p_processor and deleted_at is null and enabled;
  get diagnostics changed = row_count;
  return changed > 0;
end
$$;
revoke all on function public.kd_processor_auto_disable(text, text) from public, anon, authenticated;
grant execute on function public.kd_processor_auto_disable(text, text) to service_role;
