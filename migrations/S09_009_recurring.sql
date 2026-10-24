-- path: migrations/S09_009_recurring.sql
-- STEP 09.10 Recurring invoices. A schedule copies an invoice template on a calendar rule. Each run is claimed with a
-- unique (schedule, occurrence number) so the same occurrence is never made twice, even with two workers or a retry;
-- an invoice made by a run carries the run id (unique), so a retry after a crash finds the invoice instead of making
-- a second one.

alter table public.invoices add column if not exists recurring_run_id uuid;
create unique index if not exists uq_invoice_recurring_run on public.invoices (recurring_run_id) where recurring_run_id is not null;

create table if not exists public.recurring_schedules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  template jsonb not null check (jsonb_typeof(template) = 'object'),
  unit text not null check (unit in ('day', 'week', 'month', 'year')),
  every integer not null check (every between 1 and 365),
  month_end boolean not null default false,
  start_date date not null,
  end_date date,
  max_occurrences integer check (max_occurrences is null or max_occurrences between 1 and 1000),
  occurrences_done integer not null default 0 check (occurrences_done >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  auto_send boolean not null default false,
  send_message text not null default '' check (char_length(send_message) <= 1000),
  next_run_date date,
  last_run_on date,
  last_invoice_id uuid references public.invoices (id) on delete restrict,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text not null default '' check (char_length(last_error) <= 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.recurring_runs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  schedule_id uuid not null references public.recurring_schedules (id) on delete restrict,
  occurrence_index integer not null check (occurrence_index >= 0),
  run_date date not null,
  status text not null default 'claimed' check (status in ('claimed', 'done', 'failed')),
  invoice_id uuid references public.invoices (id) on delete restrict,
  attempts integer not null default 1,
  error text not null default '' check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.recurring_schedules');
select public.apply_standard_triggers('public.recurring_runs');
select public.rls_enable_default_deny('public.recurring_schedules');
select public.rls_enable_default_deny('public.recurring_runs');
select public.audit_enable_for('public.recurring_schedules');
revoke all on public.recurring_schedules, public.recurring_runs from authenticated;
grant all on public.recurring_schedules, public.recurring_runs to service_role;

create unique index if not exists uq_recurring_run on public.recurring_runs (schedule_id, occurrence_index);
create index if not exists ix_recurring_due on public.recurring_schedules (next_run_date) where status = 'active' and deleted_at is null;
create index if not exists ix_recurring_company on public.recurring_schedules (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_recurring_runs_schedule on public.recurring_runs (schedule_id, occurrence_index desc);

-- Claims the next occurrence of a schedule that is due. Returns nothing when it is not due, not active, or another worker
-- holds it. A failed run, or one claimed more than 15 minutes ago, can be claimed again.
create or replace function public.kd_recurring_claim(p_schedule uuid, p_today date)
returns table (run_id uuid, company_id uuid, occurrence_index integer, run_date date)
language plpgsql security definer
set search_path = public
as $$
declare
  s public.recurring_schedules%rowtype;
  r public.recurring_runs%rowtype;
begin
  select * into s from public.recurring_schedules x where x.id = p_schedule and x.deleted_at is null and x.status = 'active' for update skip locked;
  if not found or s.next_run_date is null or s.next_run_date > p_today then return; end if;
  select * into r from public.recurring_runs x where x.schedule_id = p_schedule and x.occurrence_index = s.occurrences_done;
  if found then
    if r.status = 'done' then return; end if;
    if r.status = 'claimed' and r.updated_at > now() - interval '15 minutes' then return; end if;
    update public.recurring_runs set status = 'claimed', attempts = attempts + 1, error = '' where id = r.id;
    return query select r.id, r.company_id, r.occurrence_index, r.run_date;
    return;
  end if;
  insert into public.recurring_runs (company_id, schedule_id, occurrence_index, run_date)
    values (s.company_id, s.id, s.occurrences_done, s.next_run_date) returning id into r.id;
  return query select r.id, s.company_id, s.occurrences_done, s.next_run_date;
end
$$;

-- Records a finished run and moves the schedule to its next date (null ends the schedule).
create or replace function public.kd_recurring_complete(p_run uuid, p_invoice uuid, p_next date, p_note text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r public.recurring_runs%rowtype;
begin
  select * into r from public.recurring_runs where id = p_run for update;
  if not found or r.status = 'done' then return; end if;
  update public.recurring_runs set status = 'done', invoice_id = p_invoice, error = left(coalesce(p_note, ''), 500) where id = p_run;
  update public.recurring_schedules set occurrences_done = occurrence_index_plus.n, next_run_date = p_next, last_run_on = r.run_date,
    last_invoice_id = p_invoice, failure_count = case when coalesce(p_note, '') = '' then 0 else failure_count end,
    last_error = left(coalesce(p_note, ''), 500), status = case when p_next is null then 'ended' else status end, version = version + 1
    from (select r.occurrence_index + 1 as n) occurrence_index_plus
    where id = r.schedule_id and occurrences_done = r.occurrence_index;
end
$$;

-- Records a failed run; after p_pause_after failures in a row the schedule is paused.
create or replace function public.kd_recurring_fail(p_run uuid, p_error text, p_pause_after integer)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare r public.recurring_runs%rowtype; failures integer;
begin
  select * into r from public.recurring_runs where id = p_run for update;
  if not found then return false; end if;
  update public.recurring_runs set status = 'failed', error = left(coalesce(p_error, ''), 500) where id = p_run;
  update public.recurring_schedules set failure_count = failure_count + 1, last_error = left(coalesce(p_error, ''), 500),
    status = case when failure_count + 1 >= p_pause_after then 'paused' else status end, version = version + 1
    where id = r.schedule_id returning failure_count into failures;
  return failures >= p_pause_after;
end
$$;

revoke all on function public.kd_recurring_claim(uuid, date), public.kd_recurring_complete(uuid, uuid, date, text), public.kd_recurring_fail(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.kd_recurring_claim(uuid, date), public.kd_recurring_complete(uuid, uuid, date, text), public.kd_recurring_fail(uuid, text, integer) to service_role;
