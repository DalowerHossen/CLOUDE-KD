-- path: migrations/S15_008_budgets_entities.sql
-- STEP 15.7.b Budgets, forecast settings and multi-entity groups.
--   budgets                a twelve month budget of a company (draft, pending_approval, approved, locked, superseded); a revision
--                          is a new budget that points to the one it replaces and takes its place when approved.
--   budget_lines           the amount for one revenue or expense account in one month; only a draft budget can change.
--   budget_alerts          one row per budget, account, month and level (80 or 100 percent) so an alert is sent once.
--   forecast_settings      the low cash level and the days an unpaid invoice is expected to be late.
--   entity_groups          a group of legal entities (companies of the same owner) led by one company.
--   entity_group_members   the companies in a group and the share the group owns.
--   intercompany_pairs     two accounts, one in each of two member companies, whose balances cancel in the consolidation.

create table if not exists public.budgets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  fiscal_year_start date not null check (fiscal_year_start = date_trunc('month', fiscal_year_start)::date),
  period_kind text not null default 'monthly' check (period_kind in ('monthly', 'quarterly', 'yearly')),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'locked', 'superseded')),
  revision integer not null default 1 check (revision >= 1),
  revision_of uuid references public.budgets (id) on delete restrict,
  approval_request_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status in ('approved', 'locked')) = (approved_at is not null) or status = 'superseded')
);

create table if not exists public.budget_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  budget_id uuid not null references public.budgets (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(18,4) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.budget_alerts (
  -- guard:append-only (an alert that was sent; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  budget_id uuid not null references public.budgets (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  month date not null,
  level integer not null check (level in (80, 100)),
  used_percent numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.forecast_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  low_cash_threshold numeric(18,4) not null default 0 check (low_cash_threshold >= 0),
  late_days integer not null default 7 check (late_days between 0 and 120),
  alerts_enabled boolean not null default true,
  last_alert_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.entity_groups (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.entity_group_members (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  group_id uuid not null references public.entity_groups (id) on delete restrict,
  member_company_id uuid not null references public.companies (id) on delete restrict,
  ownership_percent numeric(7,4) not null default 100 check (ownership_percent > 0 and ownership_percent <= 100),
  added_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (member_company_id <> company_id)
);

create table if not exists public.intercompany_pairs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  group_id uuid not null references public.entity_groups (id) on delete restrict,
  label text not null check (char_length(label) between 1 and 120),
  company_a uuid not null references public.companies (id) on delete restrict,
  account_a uuid not null references public.accounts (id) on delete restrict,
  company_b uuid not null references public.companies (id) on delete restrict,
  account_b uuid not null references public.accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (company_a <> company_b)
);

select public.apply_standard_triggers('public.budgets');
select public.apply_standard_triggers('public.budget_lines');
select public.apply_standard_triggers('public.forecast_settings');
select public.apply_standard_triggers('public.entity_groups');
select public.apply_standard_triggers('public.entity_group_members');
select public.apply_standard_triggers('public.intercompany_pairs');
select public.rls_enable_default_deny('public.budgets');
select public.rls_enable_default_deny('public.budget_lines');
select public.rls_enable_default_deny('public.budget_alerts');
select public.rls_enable_default_deny('public.forecast_settings');
select public.rls_enable_default_deny('public.entity_groups');
select public.rls_enable_default_deny('public.entity_group_members');
select public.rls_enable_default_deny('public.intercompany_pairs');
select public.audit_enable_for('public.budgets');
select public.audit_enable_for('public.budget_lines');
select public.audit_enable_for('public.budget_alerts');
select public.audit_enable_for('public.forecast_settings');
select public.audit_enable_for('public.entity_groups');
select public.audit_enable_for('public.entity_group_members');
select public.audit_enable_for('public.intercompany_pairs');

drop trigger if exists trg_budget_alerts_append on public.budget_alerts;
create trigger trg_budget_alerts_append before update or delete on public.budget_alerts for each row execute function public.kd_invoice_append_only();

create index if not exists ix_budgets_company on public.budgets (company_id, fiscal_year_start) where deleted_at is null;
-- One live budget per company and year: an approved or locked one.
create unique index if not exists uq_budgets_live_year on public.budgets (company_id, fiscal_year_start) where status in ('approved', 'locked') and deleted_at is null;
create unique index if not exists uq_budget_lines_cell on public.budget_lines (budget_id, account_id, month) where deleted_at is null;
create index if not exists ix_budget_lines_budget on public.budget_lines (budget_id) where deleted_at is null;
create unique index if not exists uq_budget_alerts on public.budget_alerts (budget_id, account_id, month, level);
create unique index if not exists uq_forecast_settings on public.forecast_settings (company_id) where deleted_at is null;
create unique index if not exists uq_entity_groups_company on public.entity_groups (company_id) where deleted_at is null;
create unique index if not exists uq_entity_members on public.entity_group_members (group_id, member_company_id) where deleted_at is null;
create index if not exists ix_entity_members_member on public.entity_group_members (member_company_id) where deleted_at is null;
create index if not exists ix_intercompany_group on public.intercompany_pairs (group_id) where deleted_at is null;

-- Budget rules: the status moves one way (draft, pending approval, approved, locked; an approved budget can be superseded by its
-- approved revision); a locked or superseded budget does not change; the revision it replaces is of the same company and year.
create or replace function public.kd_budget_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_old public.budgets;
begin
  if tg_op = 'INSERT' then
    if new.revision_of is not null then
      select * into v_old from public.budgets where id = new.revision_of;
      if not found or v_old.company_id <> new.company_id or v_old.fiscal_year_start <> new.fiscal_year_start then
        raise exception 'the budget to revise was not found' using errcode = 'P0002';
      end if;
    end if;
    return new;
  end if;
  if old.status in ('locked', 'superseded') and (new.status <> old.status or new.name <> old.name or new.fiscal_year_start <> old.fiscal_year_start
     or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'a locked or replaced budget cannot change' using errcode = '55000';
  end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'pending_approval')
    or (old.status = 'pending_approval' and new.status in ('approved', 'draft'))
    or (old.status = 'approved' and new.status in ('locked', 'superseded'))) then
    raise exception 'the budget cannot move from % to %', old.status, new.status using errcode = '55000';
  end if;
  if old.status in ('approved', 'pending_approval') and new.status = old.status
     and (new.name <> old.name or new.fiscal_year_start <> old.fiscal_year_start or new.period_kind <> old.period_kind) then
    raise exception 'only a draft budget can change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_budgets_guard on public.budgets;
create trigger trg_budgets_guard before insert or update on public.budgets for each row execute function public.kd_budget_guard();

-- A budget line: of a draft budget, for a revenue or expense account of the same company, in a month of the budget year.
create or replace function public.kd_budget_line_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_b public.budgets; v_a public.accounts;
begin
  select * into v_b from public.budgets where id = new.budget_id;
  if not found or v_b.company_id <> new.company_id then raise exception 'the budget was not found' using errcode = 'P0002'; end if;
  if v_b.status <> 'draft' then raise exception 'only a draft budget can change' using errcode = '55000'; end if;
  if tg_op = 'INSERT' or new.account_id <> old.account_id then
    select * into v_a from public.accounts where id = new.account_id and deleted_at is null;
    if not found or v_a.company_id <> new.company_id then raise exception 'the account was not found' using errcode = 'P0002'; end if;
    if v_a.type not in ('revenue', 'expense') then raise exception 'a budget is for revenue and expense accounts' using errcode = '22023'; end if;
  end if;
  if new.month < v_b.fiscal_year_start or new.month >= (v_b.fiscal_year_start + interval '12 months')::date then
    raise exception 'the month is outside the budget year' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists trg_budget_lines_guard on public.budget_lines;
create trigger trg_budget_lines_guard before insert or update on public.budget_lines for each row execute function public.kd_budget_line_guard();

-- A member company is not the leader itself and a pair uses accounts of its own companies.
create or replace function public.kd_entity_pair_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_a public.accounts; v_b public.accounts;
begin
  select * into v_a from public.accounts where id = new.account_a and deleted_at is null;
  select * into v_b from public.accounts where id = new.account_b and deleted_at is null;
  if v_a.id is null or v_a.company_id <> new.company_a or v_b.id is null or v_b.company_id <> new.company_b then
    raise exception 'an account does not belong to its company' using errcode = 'P0002';
  end if;
  if v_a.type <> v_b.type and not (v_a.type in ('asset', 'liability') and v_b.type in ('asset', 'liability'))
     and not (v_a.type in ('revenue', 'expense') and v_b.type in ('revenue', 'expense')) then
    raise exception 'the two accounts must mirror each other (receivable against payable, revenue against expense)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.entity_group_members m where m.group_id = new.group_id and m.member_company_id = new.company_a and m.deleted_at is null)
     and new.company_a <> new.company_id then
    raise exception 'company A is not in the group' using errcode = '22023';
  end if;
  if not exists (select 1 from public.entity_group_members m where m.group_id = new.group_id and m.member_company_id = new.company_b and m.deleted_at is null)
     and new.company_b <> new.company_id then
    raise exception 'company B is not in the group' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists trg_intercompany_pairs_guard on public.intercompany_pairs;
create trigger trg_intercompany_pairs_guard before insert or update on public.intercompany_pairs for each row execute function public.kd_entity_pair_guard();

revoke all on public.budgets, public.budget_lines, public.budget_alerts, public.forecast_settings, public.entity_groups, public.entity_group_members, public.intercompany_pairs from authenticated;
grant all on public.budgets, public.budget_lines, public.budget_alerts, public.forecast_settings, public.entity_groups, public.entity_group_members, public.intercompany_pairs to service_role;
