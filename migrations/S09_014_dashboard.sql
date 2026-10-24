-- path: migrations/S09_014_dashboard.sql
-- STEP 09.14 Dashboard: the layout each person saved (which widgets, in which order), and two read-only functions that
-- add up the numbers of the home page in the database (money as text, never as floating point).
-- Dates are UTC days. "Collected" is cash received: payments applied to invoices, without credits, deposits and write-offs.

create table if not exists public.dashboard_layouts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  widgets jsonb not null check (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.dashboard_layouts');
select public.rls_enable_default_deny('public.dashboard_layouts');
revoke all on public.dashboard_layouts from authenticated;
grant all on public.dashboard_layouts to service_role;
create unique index if not exists uq_dashboard_layout_user on public.dashboard_layouts (company_id, user_id) where deleted_at is null;

create or replace function public.kd_dashboard_stats(p_company uuid, p_from date, p_to date, p_today date)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'invoiced', coalesce((select sum(i.total) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.kind in ('invoice', 'debit_note') and i.status <> 'void' and i.sent_at is not null and (i.sent_at at time zone 'UTC')::date between p_from and p_to), 0)::text,
    'invoicedCount', (select count(*) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.kind in ('invoice', 'debit_note') and i.status <> 'void' and i.sent_at is not null and (i.sent_at at time zone 'UTC')::date between p_from and p_to),
    'collected', coalesce((select sum(l.amount) from public.invoice_payment_links l where l.company_id = p_company and l.deleted_at is null and (l.applied_at at time zone 'UTC')::date between p_from and p_to and not exists (select 1 from public.credit_applications a where a.id = l.payment_id)), 0)::text,
    'credited', coalesce((select sum(a.amount) from public.credit_applications a where a.company_id = p_company and a.deleted_at is null and a.source_type <> 'write_off' and (a.created_at at time zone 'UTC')::date between p_from and p_to), 0)::text,
    'writtenOff', coalesce((select sum(a.amount) from public.credit_applications a where a.company_id = p_company and a.deleted_at is null and a.source_type = 'write_off' and (a.created_at at time zone 'UTC')::date between p_from and p_to), 0)::text,
    'outstanding', coalesce((select sum(i.amount_due - i.amount_paid) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed')), 0)::text,
    'outstandingCount', (select count(*) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed')),
    'overdue', coalesce((select sum(i.amount_due - i.amount_paid) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.status = 'overdue'), 0)::text,
    'overdueCount', (select count(*) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.status = 'overdue'),
    'drafts', (select count(*) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.status = 'draft'),
    'aging', (
      select jsonb_build_object(
        'current', coalesce(sum(i.amount_due - i.amount_paid) filter (where i.due_date >= p_today), 0)::text,
        'd1_30', coalesce(sum(i.amount_due - i.amount_paid) filter (where i.due_date < p_today and i.due_date >= p_today - 30), 0)::text,
        'd31_60', coalesce(sum(i.amount_due - i.amount_paid) filter (where i.due_date < p_today - 30 and i.due_date >= p_today - 60), 0)::text,
        'd61_90', coalesce(sum(i.amount_due - i.amount_paid) filter (where i.due_date < p_today - 60 and i.due_date >= p_today - 90), 0)::text,
        'd90_plus', coalesce(sum(i.amount_due - i.amount_paid) filter (where i.due_date < p_today - 90), 0)::text)
      from public.invoices i
      where i.company_id = p_company and i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed')),
    'statuses', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (select i.status, count(*) as n from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.kind in ('invoice', 'debit_note') group by i.status) s)
  )
$$;

create or replace function public.kd_dashboard_series(p_company uuid, p_today date, p_months integer)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(m.d, 'YYYY-MM'),
    'invoiced', coalesce((select sum(i.total) from public.invoices i where i.company_id = p_company and i.deleted_at is null and i.kind in ('invoice', 'debit_note') and i.status <> 'void' and i.sent_at is not null and date_trunc('month', i.sent_at at time zone 'UTC') = m.d), 0)::text,
    'collected', coalesce((select sum(l.amount) from public.invoice_payment_links l where l.company_id = p_company and l.deleted_at is null and date_trunc('month', l.applied_at at time zone 'UTC') = m.d and not exists (select 1 from public.credit_applications a where a.id = l.payment_id)), 0)::text
  ) order by m.d), '[]'::jsonb)
  from generate_series(date_trunc('month', p_today::timestamp) - ((least(greatest(p_months, 1), 36) - 1) * interval '1 month'), date_trunc('month', p_today::timestamp), interval '1 month') as m(d)
$$;

revoke all on function public.kd_dashboard_stats(uuid, date, date, date), public.kd_dashboard_series(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.kd_dashboard_stats(uuid, date, date, date), public.kd_dashboard_series(uuid, date, integer) to service_role;
