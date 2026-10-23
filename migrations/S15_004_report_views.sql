-- path: migrations/S15_004_report_views.sql
-- STEP 15.4.a Reports.
--   accounts.is_cash      marks the cash and bank accounts (the cash flow statement and the cash balance report use them).
--   kd_ledger_balances    debit and credit totals per account for posted entries in a date range (closing entries optional).
--   kd_ledger_monthly     the same per month, closing entries left out (trends).
-- Only posted entries count. Both functions read the ledger of one company.

alter table public.accounts add column if not exists is_cash boolean not null default false;

create index if not exists ix_journal_lines_entry_date on public.journal_entries (company_id, status, entry_date) where deleted_at is null;

create or replace function public.kd_ledger_balances(p_company uuid, p_from date, p_to date, p_closing boolean)
returns table (account_id uuid, debit numeric, credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select l.account_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.company_id = p_company and l.deleted_at is null and e.deleted_at is null and e.status = 'posted'
    and (p_from is null or e.entry_date >= p_from) and (p_to is null or e.entry_date <= p_to)
    and (p_closing or e.entry_kind <> 'closing')
  group by l.account_id
$$;

create or replace function public.kd_ledger_monthly(p_company uuid, p_from date, p_to date)
returns table (month text, account_id uuid, debit numeric, credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(e.entry_date, 'YYYY-MM'), l.account_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.company_id = p_company and l.deleted_at is null and e.deleted_at is null and e.status = 'posted'
    and e.entry_kind <> 'closing' and e.entry_date between p_from and p_to
  group by 1, 2
$$;

revoke execute on function public.kd_ledger_balances(uuid, date, date, boolean) from public, anon, authenticated;
revoke execute on function public.kd_ledger_monthly(uuid, date, date) from public, anon, authenticated;
grant execute on function public.kd_ledger_balances(uuid, date, date, boolean) to service_role;
grant execute on function public.kd_ledger_monthly(uuid, date, date) to service_role;
