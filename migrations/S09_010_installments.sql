-- path: migrations/S09_010_installments.sql
-- STEP 09.10 Installment plans. A plan splits the amount due of a sent invoice into dated parts. Payments are not
-- matched to parts: the parts are covered in date order from the money paid so far. The overdue sweep also marks an
-- invoice overdue when a part is past its date and not covered.

create table if not exists public.installment_plans (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'replaced')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.installments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  plan_id uuid not null references public.installment_plans (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  number integer not null check (number >= 1),
  due_date date not null,
  amount numeric(18,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.installment_plans');
select public.apply_standard_triggers('public.installments');
select public.rls_enable_default_deny('public.installment_plans');
select public.rls_enable_default_deny('public.installments');
select public.audit_enable_for('public.installment_plans');
revoke all on public.installment_plans, public.installments from authenticated;
grant all on public.installment_plans, public.installments to service_role;

create unique index if not exists uq_installment_plan_active on public.installment_plans (invoice_id) where status = 'active' and deleted_at is null;
create unique index if not exists uq_installment_number on public.installments (plan_id, number) where deleted_at is null;
create index if not exists ix_installments_invoice on public.installments (invoice_id, due_date) where deleted_at is null;

-- Replaces the plan of an invoice with new parts. p_rows is [{"dueDate": "...", "amount": "..."}] in order.
create or replace function public.kd_installments_replace(p_company uuid, p_invoice uuid, p_rows jsonb, p_by uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  plan uuid;
  total numeric := 0;
  prev date := null;
  n integer := 0;
  item jsonb;
begin
  select * into inv from public.invoices where id = p_invoice and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if inv.kind not in ('invoice', 'debit_note') or inv.status not in ('sent', 'viewed', 'partially_paid', 'overdue') then
    raise exception 'invoice is not open for a plan' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 2 and 60 then
    raise exception 'a plan has 2 to 60 installments' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if (item ->> 'amount')::numeric <= 0 then raise exception 'installment must be above zero' using errcode = '22023'; end if;
    if (item ->> 'dueDate')::date < inv.issue_date or (prev is not null and (item ->> 'dueDate')::date < prev) then
      raise exception 'installment dates are not in order' using errcode = '22023';
    end if;
    prev := (item ->> 'dueDate')::date;
    total := total + (item ->> 'amount')::numeric;
  end loop;
  if total <> inv.amount_due then raise exception 'installments do not add up to the amount due' using errcode = '22023'; end if;
  update public.installments set deleted_at = now() where invoice_id = p_invoice and deleted_at is null;
  update public.installment_plans set status = 'replaced', deleted_at = now() where invoice_id = p_invoice and status = 'active' and deleted_at is null;
  insert into public.installment_plans (company_id, invoice_id, created_by) values (p_company, p_invoice, p_by) returning id into plan;
  n := 0;
  for item in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    insert into public.installments (company_id, plan_id, invoice_id, number, due_date, amount)
      values (p_company, plan, p_invoice, n, (item ->> 'dueDate')::date, (item ->> 'amount')::numeric);
  end loop;
  return plan;
end
$$;

-- Same sweep as before, and an invoice with a plan is also overdue when a part is past its date and not covered.
create or replace function public.kd_invoice_mark_overdue(p_today date)
returns table (id uuid, company_id uuid)
language sql security definer
set search_path = public
as $$
  update public.invoices i set status = 'overdue'
   where i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid') and i.amount_due - i.amount_paid > 0
     and (i.due_date < p_today or exists (
       select 1 from public.installments p
        where p.invoice_id = i.id and p.deleted_at is null and p.due_date < p_today
          and (select coalesce(sum(q.amount), 0) from public.installments q where q.invoice_id = i.id and q.deleted_at is null and q.number <= p.number) > i.amount_paid))
  returning i.id, i.company_id
$$;

revoke all on function public.kd_installments_replace(uuid, uuid, jsonb, uuid), public.kd_invoice_mark_overdue(date) from public, anon, authenticated;
grant execute on function public.kd_installments_replace(uuid, uuid, jsonb, uuid), public.kd_invoice_mark_overdue(date) to service_role;
