-- path: migrations/S15_003_periods.sql
-- STEP 15.3 Periods.
--   accounting_settings  per company: the first month of the fiscal year, what to do with an event that falls in a closed
--                        period (post it in the next open period, or fail), and a lock date (nothing is posted on or before it).
--   fiscal_years         a fiscal year of 12 months (open or closed). A closed year has its closing entry.
--   fiscal_periods       the 12 months of a year: open or closed, with a lock per module (receivables, payables) and the
--                        sign-off of the person who closed it.
--   recurring_journals   an entry that repeats (monthly, quarterly, yearly) and is made as a draft or posted by a job.
-- A posting into a closed period, a locked module or on or before the lock date is refused by the database (KD002).

create table if not exists public.accounting_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  fiscal_start_month integer not null default 1 check (fiscal_start_month between 1 and 12),
  closed_period_policy text not null default 'next_open' check (closed_period_policy in ('next_open', 'fail')),
  lock_date date,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.fiscal_years (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  label text not null check (char_length(label) between 1 and 40),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closing_entry_id uuid references public.journal_entries (id) on delete restrict,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date > start_date),
  check ((status = 'closed') = (closed_at is not null))
);

create table if not exists public.fiscal_periods (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  fiscal_year_id uuid not null references public.fiscal_years (id) on delete restrict,
  number integer not null check (number between 1 and 12),
  name text not null check (char_length(name) between 1 and 40),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  ar_closed boolean not null default false,
  ap_closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid,
  signoff_note text not null default '' check (char_length(signoff_note) <= 500),
  reopen_count integer not null default 0 check (reopen_count >= 0),
  reopen_reason text check (reopen_reason is null or char_length(reopen_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_date >= start_date),
  check ((status = 'closed') = (closed_at is not null))
);

create table if not exists public.recurring_journals (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  memo text not null default '' check (char_length(memo) <= 500),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly')),
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  next_run date not null,
  end_date date,
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 2 and 200),
  auto_post boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'finished')),
  run_count integer not null default 0 check (run_count >= 0),
  last_run date,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.accounting_settings');
select public.apply_standard_triggers('public.fiscal_years');
select public.apply_standard_triggers('public.fiscal_periods');
select public.apply_standard_triggers('public.recurring_journals');
select public.rls_enable_default_deny('public.accounting_settings');
select public.rls_enable_default_deny('public.fiscal_years');
select public.rls_enable_default_deny('public.fiscal_periods');
select public.rls_enable_default_deny('public.recurring_journals');
select public.audit_enable_for('public.accounting_settings');
select public.audit_enable_for('public.fiscal_years');
select public.audit_enable_for('public.fiscal_periods');
select public.audit_enable_for('public.recurring_journals');

create unique index if not exists uq_accounting_settings on public.accounting_settings (company_id) where deleted_at is null;
create unique index if not exists uq_fiscal_years_start on public.fiscal_years (company_id, start_date) where deleted_at is null;
create unique index if not exists uq_fiscal_periods_no on public.fiscal_periods (fiscal_year_id, number) where deleted_at is null;
create index if not exists ix_fiscal_periods_dates on public.fiscal_periods (company_id, start_date, end_date) where deleted_at is null;
create index if not exists ix_recurring_journals_due on public.recurring_journals (next_run) where status = 'active' and deleted_at is null;

-- Years of one company do not overlap.
create or replace function public.kd_fiscal_year_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.fiscal_years y where y.company_id = new.company_id and y.id <> new.id and y.deleted_at is null
             and new.deleted_at is null and y.start_date <= new.end_date and y.end_date >= new.start_date) then
    raise exception 'fiscal years cannot overlap' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists trg_fiscal_years_guard on public.fiscal_years;
create trigger trg_fiscal_years_guard before insert or update of start_date, end_date on public.fiscal_years for each row execute function public.kd_fiscal_year_guard();

-- Makes a year of 12 monthly periods starting on p_start (the first day of a month). Safe to call twice for the same start.
create or replace function public.kd_fiscal_year_create(p_company uuid, p_start date, p_label text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_i integer;
  v_from date;
begin
  if p_start <> date_trunc('month', p_start)::date then raise exception 'a year starts on the first day of a month' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':fy:' || p_start::text, 0));
  select id into v_id from public.fiscal_years where company_id = p_company and start_date = p_start and deleted_at is null;
  if found then return v_id; end if;
  insert into public.fiscal_years (company_id, label, start_date, end_date)
    values (p_company, p_label, p_start, (p_start + interval '12 months' - interval '1 day')::date) returning id into v_id;
  for v_i in 1..12 loop
    v_from := (p_start + ((v_i - 1) || ' months')::interval)::date;
    insert into public.fiscal_periods (company_id, fiscal_year_id, number, name, start_date, end_date)
      values (p_company, v_id, v_i, to_char(v_from, 'Mon YYYY'), v_from, (v_from + interval '1 month' - interval '1 day')::date);
  end loop;
  return v_id;
end
$$;

-- Refuses to post an entry into a closed period, a locked module, or on or before the lock date. Companies without
-- periods are not restricted. The module of an entry follows its source type.
create or replace function public.kd_period_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lock date;
  v_p public.fiscal_periods;
begin
  if new.status = 'posted' and old.status <> 'posted' then
    select lock_date into v_lock from public.accounting_settings where company_id = new.company_id and deleted_at is null;
    if v_lock is not null and new.entry_date <= v_lock and new.entry_kind <> 'closing' then
      raise exception 'the books are locked up to %', v_lock using errcode = 'KD002';
    end if;
    select * into v_p from public.fiscal_periods where company_id = new.company_id and deleted_at is null
      and new.entry_date between start_date and end_date limit 1;
    if found then
      if v_p.status = 'closed' then raise exception 'the period % is closed', v_p.name using errcode = 'KD002'; end if;
      if v_p.ar_closed and new.source_type in ('invoice', 'payment', 'refund', 'dispute') then
        raise exception 'receivables are closed for %', v_p.name using errcode = 'KD002';
      end if;
      if v_p.ap_closed and new.source_type in ('expense', 'pay_run') then
        raise exception 'payables are closed for %', v_p.name using errcode = 'KD002';
      end if;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_journal_entries_period on public.journal_entries;
create trigger trg_journal_entries_period before update on public.journal_entries for each row execute function public.kd_period_guard();

-- Closes a period: every entry dated in it must be posted. The person who closes it signs it off.
create or replace function public.kd_period_close(p_company uuid, p_period uuid, p_actor uuid, p_note text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.fiscal_periods;
  v_open integer;
begin
  select * into v_p from public.fiscal_periods where id = p_period and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'period not found' using errcode = 'P0002'; end if;
  if v_p.status = 'closed' then return jsonb_build_object('period_id', v_p.id, 'replay', true); end if;
  select count(*) into v_open from public.journal_entries
    where company_id = p_company and deleted_at is null and status <> 'posted' and entry_date between v_p.start_date and v_p.end_date;
  if v_open > 0 then raise exception '% entries in this period are not posted yet', v_open using errcode = '55000'; end if;
  update public.fiscal_periods set status = 'closed', closed_at = now(), closed_by = p_actor, signoff_note = coalesce(p_note, ''),
    ar_closed = true, ap_closed = true where id = p_period;
  return jsonb_build_object('period_id', v_p.id, 'replay', false);
end
$$;

-- Opens a closed period again (the year must be open). Counts the reopening and keeps the reason.
create or replace function public.kd_period_reopen(p_company uuid, p_period uuid, p_actor uuid, p_reason text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.fiscal_periods;
  v_y public.fiscal_years;
begin
  select * into v_p from public.fiscal_periods where id = p_period and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'period not found' using errcode = 'P0002'; end if;
  select * into v_y from public.fiscal_years where id = v_p.fiscal_year_id;
  if v_y.status = 'closed' then raise exception 'the year is closed; reopen the year first' using errcode = '55000'; end if;
  if v_p.status = 'open' then return jsonb_build_object('period_id', v_p.id, 'replay', true); end if;
  update public.fiscal_periods set status = 'open', closed_at = null, closed_by = null, signoff_note = '', ar_closed = false, ap_closed = false,
    reopen_count = reopen_count + 1, reopen_reason = p_reason where id = p_period;
  return jsonb_build_object('period_id', v_p.id, 'replay', false);
end
$$;

-- Debit and credit totals per account for posted entries dated from p_from to p_to; closing entries are left out.
create or replace function public.kd_period_balances(p_company uuid, p_from date, p_to date) returns table (account_id uuid, debit numeric, credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select l.account_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.company_id = p_company and l.deleted_at is null and e.deleted_at is null and e.status = 'posted'
    and e.entry_kind <> 'closing' and e.entry_date between p_from and p_to
  group by l.account_id
$$;

revoke all on public.accounting_settings, public.fiscal_years, public.fiscal_periods, public.recurring_journals from authenticated;
grant all on public.accounting_settings, public.fiscal_years, public.fiscal_periods, public.recurring_journals to service_role;
revoke execute on function public.kd_fiscal_year_create(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.kd_period_close(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.kd_period_reopen(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.kd_period_balances(uuid, date, date) from public, anon, authenticated;
grant execute on function public.kd_fiscal_year_create(uuid, date, text) to service_role;
grant execute on function public.kd_period_close(uuid, uuid, uuid, text) to service_role;
grant execute on function public.kd_period_reopen(uuid, uuid, uuid, text) to service_role;
grant execute on function public.kd_period_balances(uuid, date, date) to service_role;
