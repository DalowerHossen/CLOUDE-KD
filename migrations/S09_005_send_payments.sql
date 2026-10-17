-- path: migrations/S09_005_send_payments.sql
-- STEP 09.6 Sending an invoice (number, seller snapshot and status in one transaction), applying a payment, and the
-- overdue sweep. The remit-to bank details are kept encrypted in the tax settings row.

alter table public.tax_settings add column if not exists remit_to_enc jsonb check (remit_to_enc is null or jsonb_typeof(remit_to_enc) = 'object');

-- Sends a draft or an approved invoice: checks it, gives it its number if it has none, freezes the seller block and
-- sets the status, all in one transaction. A zero invoice has nothing to pay and becomes paid at once.
create or replace function public.kd_invoice_send(p_company uuid, p_invoice uuid, p_prefix text, p_yearly boolean, p_padding integer, p_start bigint, p_year integer, p_seller jsonb, p_by uuid, p_approved_by uuid)
returns table (number text, status text, amount_due numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  series text;
  n bigint;
  num text;
  new_status text;
  lines integer;
begin
  select * into inv from public.invoices where id = p_invoice and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if inv.status not in ('draft', 'pending_approval') then raise exception 'invoice was already sent' using errcode = '22023'; end if;
  select count(*) into lines from public.invoice_items where invoice_id = p_invoice and deleted_at is null;
  if lines = 0 then raise exception 'invoice has no lines' using errcode = '22023'; end if;
  if inv.client_id is null and inv.walk_in_name = '' and coalesce(inv.bill_to ->> 'name', '') = '' then raise exception 'invoice has no client' using errcode = '22023'; end if;
  if coalesce(inv.bill_to ->> 'postalCode', '') = '' or coalesce(inv.bill_to ->> 'country', '') = '' then raise exception 'billing postal code and country are missing' using errcode = '22023'; end if;
  if inv.total < 0 or inv.amount_due < 0 then raise exception 'total is below zero' using errcode = '22023'; end if;
  num := inv.number;
  if num is null then
    series := case inv.kind when 'invoice' then 'INV' when 'proforma' then 'PI' when 'deposit' then 'DEP' else 'DN' end;
    n := public.kd_next_doc_number(p_company, series, case when p_yearly then p_year else 0 end, p_start);
    num := p_prefix || case when p_yearly then p_year::text || '-' else '' end || lpad(n::text, greatest(p_padding, 1), '0');
  end if;
  new_status := case when inv.amount_due = 0 then 'paid' else 'sent' end;
  update public.invoices set number = num, status = new_status, sent_at = now(), sent_by = p_by, seller = p_seller,
    approved_by = coalesce(p_approved_by, approved_by), approved_at = case when p_approved_by is not null then now() else approved_at end,
    paid_at = case when new_status = 'paid' then now() else null end, rejected_reason = ''
   where id = p_invoice;
  return query select num, new_status, inv.amount_due;
end
$$;

-- Applies a payment of the payment STEP. The same payment applied twice changes nothing (replayed = true). The amount
-- cannot be more than the balance; the payment STEP keeps any surplus as a client credit.
create or replace function public.kd_invoice_apply_payment(p_invoice uuid, p_payment uuid, p_amount numeric)
returns table (company_id uuid, status text, amount_paid numeric, balance numeric, replayed boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  paid numeric;
  new_status text;
begin
  select * into inv from public.invoices where id = p_invoice and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if exists (select 1 from public.invoice_payment_links l where l.invoice_id = p_invoice and l.payment_id = p_payment and l.deleted_at is null) then
    return query select inv.company_id, inv.status, inv.amount_paid, inv.amount_due - inv.amount_paid, true;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be above zero' using errcode = '22023'; end if;
  if inv.status not in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed') then raise exception 'invoice cannot receive a payment in this state' using errcode = '22023'; end if;
  if inv.amount_paid + p_amount > inv.amount_due then raise exception 'amount is more than the balance' using errcode = '22023'; end if;
  insert into public.invoice_payment_links (company_id, invoice_id, payment_id, amount) values (inv.company_id, p_invoice, p_payment, p_amount);
  paid := inv.amount_paid + p_amount;
  new_status := case when paid >= inv.amount_due then 'paid' when inv.status = 'disputed' then 'disputed' else 'partially_paid' end;
  update public.invoices set amount_paid = paid, status = new_status, paid_at = case when new_status = 'paid' then now() else paid_at end where id = p_invoice;
  return query select inv.company_id, new_status, paid, inv.amount_due - paid, false;
end
$$;

-- Marks sent, viewed and partly paid invoices past their due date as overdue; returns what changed.
create or replace function public.kd_invoice_mark_overdue(p_today date)
returns table (id uuid, company_id uuid)
language sql security definer
set search_path = public
as $$
  update public.invoices i set status = 'overdue'
   where i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid') and i.due_date < p_today and i.amount_due - i.amount_paid > 0
  returning i.id, i.company_id
$$;

revoke all on function public.kd_invoice_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid, uuid), public.kd_invoice_apply_payment(uuid, uuid, numeric), public.kd_invoice_mark_overdue(date) from public, anon, authenticated;
grant execute on function public.kd_invoice_send(uuid, uuid, text, boolean, integer, bigint, integer, jsonb, uuid, uuid), public.kd_invoice_apply_payment(uuid, uuid, numeric), public.kd_invoice_mark_overdue(date) to service_role;
