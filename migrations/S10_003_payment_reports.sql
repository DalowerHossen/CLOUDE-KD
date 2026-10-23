-- path: migrations/S10_003_payment_reports.sql
-- STEP 10.11 Payment reports. Two read-only functions: a company's payment report over a period (by day and status) and
-- the platform's gateway health (by processor: attempts, outcomes, declines by category). Money is numeric(18,4).

create or replace function public.kd_payment_report(p_company uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, status text, payment_count bigint, amount numeric, captured numeric, refunded numeric)
language sql
stable
security definer
set search_path = public
as $$
  select (p.created_at at time zone 'UTC')::date as day,
         p.status,
         count(*) as payment_count,
         coalesce(sum(p.amount), 0)::numeric(18,4) as amount,
         coalesce(sum(p.captured_amount), 0)::numeric(18,4) as captured,
         coalesce(sum(p.refunded_amount), 0)::numeric(18,4) as refunded
  from public.payments p
  where p.company_id = p_company and p.deleted_at is null and p.created_at >= p_from and p.created_at < p_to
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.kd_gateway_health(p_since timestamptz)
returns table (processor_id text, outcome text, decline_category text, attempt_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select a.processor_id, a.outcome, a.decline_category, count(*) as attempt_count
  from public.payment_attempts a
  where a.created_at >= p_since and a.processor_id is not null and a.action in ('authorize', 'charge')
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

revoke all on function public.kd_payment_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.kd_gateway_health(timestamptz) from public, anon, authenticated;
grant execute on function public.kd_payment_report(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.kd_gateway_health(timestamptz) to service_role;
