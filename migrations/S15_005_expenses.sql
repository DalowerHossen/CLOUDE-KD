-- path: migrations/S15_005_expenses.sql
-- STEP 15.5 Expenses.
--   expense_categories  nested categories; each can point at an account of the chart and says whether it is tax deductible.
--   expenses            an expense: date, category, vendor, net amount, tax, who submitted it, approval state, payment state,
--                       reimbursement (paid by an employee), policy flags and the receipt hash used to find duplicates.
--   receipts            a receipt file kept through the storage contract, with its checksum and the OCR result (filled by the
--                       OCR service of another STEP through `applyOcrResult`).
--   expense_policies    limits and rules per category and role: amount limits, receipt rule, auto-approval, flag or block.
--   recurring_expenses  an expense that repeats; each run makes an ordinary expense with `recurring_id` (the history).
-- An approved expense cannot change its date, amounts or category (it has been booked); it cannot be removed.

create table if not exists public.expense_categories (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  parent_id uuid references public.expense_categories (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  tax_deductible boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.expenses (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  expense_date date not null,
  category_id uuid references public.expense_categories (id) on delete restrict,
  vendor text not null default '' check (char_length(vendor) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  amount_net numeric(18,4) not null check (amount_net > 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  total numeric(18,4) not null check (total > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  paid_via text check (paid_via is null or paid_via in ('bank', 'cash', 'card', 'payroll')),
  paid_reference text check (paid_reference is null or char_length(paid_reference) <= 120),
  reimbursable boolean not null default false,
  submitted_by uuid not null,
  employee_id uuid,
  approval_request_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  override_reason text check (override_reason is null or char_length(override_reason) <= 300),
  policy_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(policy_flags) = 'array'),
  receipt_hash text check (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$'),
  duplicate_of uuid references public.expenses (id) on delete restrict,
  recurring_id uuid,
  tax_deductible boolean not null default true,
  event_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (total = amount_net + tax_amount),
  check ((payment_status = 'paid') = (paid_at is not null)),
  check (status <> 'rejected' or reject_reason is not null),
  check (status <> 'approved' or decided_at is not null)
);

create table if not exists public.receipts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  expense_id uuid references public.expenses (id) on delete restrict,
  file_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) between 3 and 100),
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ocr_status text not null default 'none' check (ocr_status in ('none', 'pending', 'done', 'failed')),
  ocr_data jsonb not null default '{}'::jsonb check (jsonb_typeof(ocr_data) = 'object'),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.expense_policies (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  category_id uuid references public.expense_categories (id) on delete restrict,
  role text check (role is null or role in ('owner', 'staff')),
  max_per_expense numeric(18,4) check (max_per_expense is null or max_per_expense > 0),
  max_per_day numeric(18,4) check (max_per_day is null or max_per_day > 0),
  max_per_month numeric(18,4) check (max_per_month is null or max_per_month > 0),
  receipt_required_above numeric(18,4) check (receipt_required_above is null or receipt_required_above >= 0),
  auto_approve_below numeric(18,4) check (auto_approve_below is null or auto_approve_below > 0),
  breach_action text not null default 'flag' check (breach_action in ('flag', 'block')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.recurring_expenses (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  category_id uuid references public.expense_categories (id) on delete restrict,
  vendor text not null default '' check (char_length(vendor) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  amount_net numeric(18,4) not null check (amount_net > 0),
  tax_amount numeric(18,4) not null default 0 check (tax_amount >= 0),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly')),
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  next_run date not null,
  end_date date,
  paid boolean not null default false,
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

select public.apply_standard_triggers('public.expense_categories');
select public.apply_standard_triggers('public.expenses');
select public.apply_standard_triggers('public.receipts');
select public.apply_standard_triggers('public.expense_policies');
select public.apply_standard_triggers('public.recurring_expenses');
select public.rls_enable_default_deny('public.expense_categories');
select public.rls_enable_default_deny('public.expenses');
select public.rls_enable_default_deny('public.receipts');
select public.rls_enable_default_deny('public.expense_policies');
select public.rls_enable_default_deny('public.recurring_expenses');
select public.audit_enable_for('public.expense_categories');
select public.audit_enable_for('public.expenses');
select public.audit_enable_for('public.receipts');
select public.audit_enable_for('public.expense_policies');
select public.audit_enable_for('public.recurring_expenses');

create unique index if not exists uq_expense_categories_name on public.expense_categories (company_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) where deleted_at is null;
create index if not exists ix_expenses_company_date on public.expenses (company_id, expense_date desc) where deleted_at is null;
create index if not exists ix_expenses_status on public.expenses (company_id, status) where deleted_at is null;
create index if not exists ix_expenses_submitter on public.expenses (company_id, submitted_by, expense_date desc) where deleted_at is null;
create index if not exists ix_expenses_duplicate on public.expenses (company_id, total, expense_date) where deleted_at is null;
create index if not exists ix_expenses_receipt_hash on public.expenses (company_id, receipt_hash) where receipt_hash is not null and deleted_at is null;
create unique index if not exists uq_expenses_recurring on public.expenses (recurring_id, expense_date) where recurring_id is not null and deleted_at is null;
create index if not exists ix_receipts_expense on public.receipts (expense_id) where deleted_at is null;
create index if not exists ix_receipts_hash on public.receipts (company_id, sha256) where deleted_at is null;
create index if not exists ix_recurring_expenses_due on public.recurring_expenses (next_run) where status = 'active' and deleted_at is null;

-- Category rules: the parent is in the same company, the tree is at most 4 deep, the account is an expense account of the company.
create or replace function public.kd_expense_category_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.expense_categories;
  v_acc public.accounts;
  v_depth integer := 1;
  v_cur uuid;
begin
  if new.parent_id is not null then
    select * into v_parent from public.expense_categories where id = new.parent_id and deleted_at is null;
    if not found or v_parent.company_id <> new.company_id then raise exception 'the parent category was not found' using errcode = 'P0002'; end if;
    v_cur := v_parent.parent_id;
    while v_cur is not null loop
      v_depth := v_depth + 1;
      if v_cur = new.id or v_depth > 3 then raise exception 'categories can be nested 4 levels deep' using errcode = '22023'; end if;
      select parent_id into v_cur from public.expense_categories where id = v_cur;
    end loop;
  end if;
  if new.account_id is not null then
    select * into v_acc from public.accounts where id = new.account_id and deleted_at is null;
    if not found or v_acc.company_id <> new.company_id then raise exception 'the account was not found' using errcode = 'P0002'; end if;
    if v_acc.type <> 'expense' then raise exception 'a category posts to an expense account' using errcode = '22023'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_expense_categories_guard on public.expense_categories;
create trigger trg_expense_categories_guard before insert or update on public.expense_categories for each row execute function public.kd_expense_category_guard();

-- An approved expense has been booked: its date, amounts, category and company never change and it is not removed.
create or replace function public.kd_expense_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_cat public.expense_categories;
begin
  if new.category_id is not null and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
    select * into v_cat from public.expense_categories where id = new.category_id and deleted_at is null;
    if not found or v_cat.company_id <> new.company_id then raise exception 'the category was not found' using errcode = 'P0002'; end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.expense_date <> old.expense_date or new.amount_net <> old.amount_net or new.tax_amount <> old.tax_amount
       or new.total <> old.total or new.category_id is distinct from old.category_id or new.company_id <> old.company_id
       or new.status <> 'approved' or new.deleted_at is distinct from old.deleted_at or new.submitted_by <> old.submitted_by then
      raise exception 'an approved expense cannot change' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_expenses_guard on public.expenses;
create trigger trg_expenses_guard before insert or update on public.expenses for each row execute function public.kd_expense_guard();

revoke all on public.expense_categories, public.expenses, public.receipts, public.expense_policies, public.recurring_expenses from authenticated;
grant all on public.expense_categories, public.expenses, public.receipts, public.expense_policies, public.recurring_expenses to service_role;
