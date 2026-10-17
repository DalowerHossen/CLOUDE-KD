-- path: migrations/S09_010_installments_down.sql
drop function if exists public.kd_installments_replace(uuid, uuid, jsonb, uuid);
drop table if exists public.installments;
drop table if exists public.installment_plans;
create or replace function public.kd_invoice_mark_overdue(p_today date)
returns table (id uuid, company_id uuid)
language sql security definer
set search_path = public
as $$
  update public.invoices i set status = 'overdue'
   where i.deleted_at is null and i.status in ('sent', 'viewed', 'partially_paid') and i.due_date < p_today and i.amount_due - i.amount_paid > 0
  returning i.id, i.company_id
$$;
