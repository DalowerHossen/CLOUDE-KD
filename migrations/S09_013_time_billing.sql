-- path: migrations/S09_013_time_billing.sql
-- STEP 09.13 Billing time. Approved billable entries are claimed one by one (status "invoiced", no invoice yet), so two
-- people billing at the same time can never bill the same hour twice; the invoice is then linked. A claim without an
-- invoice that is older than an hour is released by a job. Voiding or deleting the invoice releases its time.

create or replace function public.kd_time_claim(p_company uuid, p_ids uuid[])
returns setof uuid
language sql security definer
set search_path = public
as $$
  update public.time_entries set status = 'invoiced', version = version + 1
   where company_id = p_company and id = any (p_ids) and status = 'approved' and billable and invoice_id is null and deleted_at is null and timer_started_at is null
  returning id
$$;

create or replace function public.kd_time_link(p_company uuid, p_ids uuid[], p_invoice uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.time_entries set invoice_id = p_invoice, version = version + 1
   where company_id = p_company and id = any (p_ids) and status = 'invoiced' and invoice_id is null;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Gives time back: the entries of an invoice (p_invoice), or the given claimed entries (p_ids) that have no invoice yet.
create or replace function public.kd_time_release(p_company uuid, p_invoice uuid, p_ids uuid[])
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  if p_invoice is not null then
    update public.time_entries set status = 'approved', invoice_id = null, version = version + 1
     where company_id = p_company and invoice_id = p_invoice and status = 'invoiced';
  else
    update public.time_entries set status = 'approved', version = version + 1
     where company_id = p_company and id = any (p_ids) and status = 'invoiced' and invoice_id is null;
  end if;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Job helper: claims that never got an invoice (a crash between claiming and linking) go back to "approved".
create or replace function public.kd_time_release_stale()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.time_entries set status = 'approved', version = version + 1
   where status = 'invoiced' and invoice_id is null and updated_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_time_claim(uuid, uuid[]), public.kd_time_link(uuid, uuid[], uuid), public.kd_time_release(uuid, uuid, uuid[]), public.kd_time_release_stale() from public, anon, authenticated;
grant execute on function public.kd_time_claim(uuid, uuid[]), public.kd_time_link(uuid, uuid[], uuid), public.kd_time_release(uuid, uuid, uuid[]), public.kd_time_release_stale() to service_role;
