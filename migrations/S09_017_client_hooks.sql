-- path: migrations/S09_017_client_hooks.sql
-- STEP 09.17 What STEP 08 asks of the invoicing STEP: (1) a client's balance columns follow the invoices by themselves
-- (a trigger calls kd_client_set_balances after any change of an invoice's status, amounts or client); (2) merging two
-- clients moves their invoices, estimates, credit notes, schedules, projects and tax exemption to the kept client even
-- though sent documents are fixed: the three guards let a change of client_id through, and only that, while the merge
-- function runs (a transaction-local setting that only that function sets).

create or replace function public.kd_invoice_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'viewed_at', 'paid_at', 'amount_paid', 'internal_notes', 'tags', 'category',
    'void_reason', 'voided_at', 'disputed_at', 'approval_request_id', 'approved_by', 'approved_at', 'rejected_reason', 'sent_at',
    'sent_by', 'deleted_at', 'project_id', 'seller', 'number'];
begin
  if current_setting('kd.merge_client', true) = 'on'
     and (to_jsonb(new) - array['client_id', 'updated_at', 'version']) is not distinct from (to_jsonb(old) - array['client_id', 'updated_at', 'version']) then
    return new;
  end if;
  if old.status = 'draft' or new.status = 'draft' then
    -- A draft that was never sent can be deleted; one that carries payments or a number cannot.
    if new.deleted_at is not null and old.deleted_at is null and (old.amount_paid > 0 or old.status not in ('draft', 'void')) then
      raise exception 'an invoice with payments cannot be deleted' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'a sent invoice cannot be changed' using errcode = '42501';
  end if;
  if new.number is distinct from old.number and old.number is not null then
    raise exception 'the invoice number cannot be changed' using errcode = '42501';
  end if;
  if new.seller is distinct from old.seller and old.seller is not null then
    raise exception 'the seller details are frozen once the invoice is sent' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null and (old.amount_paid > 0 or old.status <> 'void') then
    raise exception 'an invoice that was sent can only be voided, not deleted' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.kd_estimate_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'viewed_at', 'decided_at', 'decision_note', 'signer_name', 'signer_ip',
    'signer_agent', 'signature_hash', 'converted_invoice_id', 'void_reason', 'deleted_at', 'sent_at', 'sent_by', 'seller', 'number'];
begin
  if current_setting('kd.merge_client', true) = 'on'
     and (to_jsonb(new) - array['client_id', 'updated_at', 'version']) is not distinct from (to_jsonb(old) - array['client_id', 'updated_at', 'version']) then
    return new;
  end if;
  if old.decided_at is not null then
    if (to_jsonb(new) - array['status', 'updated_at', 'version', 'converted_invoice_id', 'void_reason', 'deleted_at']) is distinct from
       (to_jsonb(old) - array['status', 'updated_at', 'version', 'converted_invoice_id', 'void_reason', 'deleted_at']) then
      raise exception 'a decided estimate cannot be changed' using errcode = '42501';
    end if;
    if new.status <> old.status and new.status not in ('converted', 'void') then
      raise exception 'a decided estimate cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'draft' or new.status = 'draft' then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'a sent estimate cannot be changed' using errcode = '42501';
  end if;
  if old.number is not null and new.number is distinct from old.number then
    raise exception 'the estimate number cannot be changed' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.kd_credit_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  free text[] := array['status', 'updated_at', 'version', 'applied_amount', 'void_reason', 'voided_at', 'deleted_at', 'number', 'seller', 'issued_at', 'issued_by'];
begin
  if current_setting('kd.merge_client', true) = 'on'
     and (to_jsonb(new) - array['client_id', 'updated_at', 'version']) is not distinct from (to_jsonb(old) - array['client_id', 'updated_at', 'version']) then
    return new;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'an issued credit note cannot be changed' using errcode = '42501';
  end if;
  if new.number is distinct from old.number then
    raise exception 'the credit note number cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'a void credit note cannot be used again' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.kd_sync_client_balance(p_company uuid, p_client uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare outstanding numeric; overdue numeric; last_sent timestamptz; last_paid timestamptz;
begin
  if p_client is null then return; end if;
  select coalesce(sum(i.amount_due - i.amount_paid) filter (where i.status in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed')), 0),
         coalesce(sum(i.amount_due - i.amount_paid) filter (where i.status = 'overdue'), 0),
         max(i.sent_at)
    into outstanding, overdue, last_sent
    from public.invoices i
   where i.company_id = p_company and i.client_id = p_client and i.deleted_at is null and i.kind in ('invoice', 'debit_note', 'deposit');
  select max(l.applied_at) into last_paid
    from public.invoice_payment_links l join public.invoices i on i.id = l.invoice_id
   where l.company_id = p_company and i.client_id = p_client and l.deleted_at is null
     and not exists (select 1 from public.credit_applications a where a.id = l.payment_id);
  perform public.kd_client_set_balances(p_company, p_client, outstanding, overdue, last_sent, last_paid);
end
$$;

create or replace function public.kd_invoice_balance_trigger() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.amount_paid is not distinct from new.amount_paid
     and old.amount_due is not distinct from new.amount_due and old.client_id is not distinct from new.client_id
     and old.deleted_at is not distinct from new.deleted_at and old.sent_at is not distinct from new.sent_at then
    return new;
  end if;
  perform public.kd_sync_client_balance(new.company_id, new.client_id);
  if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
    perform public.kd_sync_client_balance(old.company_id, old.client_id);
  end if;
  return new;
end
$$;
drop trigger if exists trg_invoices_balance on public.invoices;
create trigger trg_invoices_balance after insert or update on public.invoices for each row execute function public.kd_invoice_balance_trigger();

-- Moves everything that points at the removed client to the kept client. Returns how many rows moved, by kind.
create or replace function public.kd_invoice_merge_client(p_company uuid, p_from uuid, p_into uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare inv integer; est integer; cre integer; rec integer; prj integer; itm integer; exm integer := 0;
begin
  if p_from = p_into then raise exception 'cannot merge a client into itself' using errcode = '22023'; end if;
  perform set_config('kd.merge_client', 'on', true);
  update public.invoices set client_id = p_into where company_id = p_company and client_id = p_from;
  get diagnostics inv = row_count;
  update public.estimates set client_id = p_into where company_id = p_company and client_id = p_from;
  get diagnostics est = row_count;
  update public.credit_notes set client_id = p_into where company_id = p_company and client_id = p_from;
  get diagnostics cre = row_count;
  perform set_config('kd.merge_client', 'off', true);
  update public.recurring_schedules set client_id = p_into where company_id = p_company and client_id = p_from;
  get diagnostics rec = row_count;
  update public.projects set client_id = p_into where company_id = p_company and client_id = p_from;
  get diagnostics prj = row_count;
  update public.invoice_batch_items set client_id = p_into where company_id = p_company and client_id = p_from and status = 'pending'
    and not exists (select 1 from public.invoice_batch_items o where o.batch_id = invoice_batch_items.batch_id and o.client_id = p_into and o.deleted_at is null);
  get diagnostics itm = row_count;
  if exists (select 1 from public.client_tax_exemptions e where e.company_id = p_company and e.client_id = p_into and e.deleted_at is null) then
    update public.client_tax_exemptions set deleted_at = now() where company_id = p_company and client_id = p_from and deleted_at is null;
  else
    update public.client_tax_exemptions set client_id = p_into where company_id = p_company and client_id = p_from and deleted_at is null;
    get diagnostics exm = row_count;
  end if;
  perform public.kd_sync_client_balance(p_company, p_into);
  perform public.kd_sync_client_balance(p_company, p_from);
  return jsonb_build_object('invoices', inv, 'estimates', est, 'creditNotes', cre, 'schedules', rec, 'projects', prj, 'batchItems', itm, 'exemptions', exm);
end
$$;

revoke all on function public.kd_sync_client_balance(uuid, uuid), public.kd_invoice_merge_client(uuid, uuid, uuid), public.kd_invoice_balance_trigger() from public, anon, authenticated;
grant execute on function public.kd_sync_client_balance(uuid, uuid), public.kd_invoice_merge_client(uuid, uuid, uuid) to service_role;
