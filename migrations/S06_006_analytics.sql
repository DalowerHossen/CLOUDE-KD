-- path: migrations/S06_006_analytics.sql
-- STEP 06.7 First-party, cookie-free counters of the public site: visits per day, page and event. No visitor data.

create table if not exists public.analytics_daily (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  day date not null,
  path text not null check (path ~ '^/[a-z0-9/._-]{0,120}$'),
  event text not null check (event in ('page_view', 'signup_click', 'contact_sent', 'cta_click', 'free_tool_used')),
  hit_count bigint not null default 0 check (hit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.analytics_daily');
select public.rls_enable_default_deny('public.analytics_daily');
select public.audit_enable_for('public.analytics_daily');

create unique index if not exists uq_analytics_daily on public.analytics_daily (day, path, event);
create index if not exists ix_analytics_day on public.analytics_daily (day desc);

revoke all on public.analytics_daily from authenticated;
grant all on public.analytics_daily to service_role;

-- Adds one to the counter of the day, page and event (UTC day).
create or replace function public.kd_analytics_hit(p_path text, p_event text) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.analytics_daily (day, path, event, hit_count)
  values ((now() at time zone 'utc')::date, p_path, p_event, 1)
  on conflict (day, path, event) do update set hit_count = public.analytics_daily.hit_count + 1;
end
$$;

revoke all on function public.kd_analytics_hit(text, text) from public, anon, authenticated;
grant execute on function public.kd_analytics_hit(text, text) to service_role;
