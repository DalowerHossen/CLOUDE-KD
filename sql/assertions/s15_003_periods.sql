-- path: sql/assertions/s15_003_periods.sql
-- Periods: RLS on; a year makes 12 periods and is created once; years cannot overlap; an entry in a closed period, a
-- closed module or on or before the lock date is refused (KD002); a period cannot close with unposted entries; closing is
-- a replay the second time; reopening counts; reopen is refused in a closed year; the period balances leave closing
-- entries out; companies without periods are not restricted.
do $$
declare
  c uuid; c2 uuid; b2 uuid; bank uuid; rev uuid; y uuid; p uuid; r jsonb; n integer; d numeric; lines jsonb;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('accounting_settings', 'fiscal_years', 'fiscal_periods', 'recurring_journals') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Period Co', 'period-co') returning id into c;
  insert into public.companies (name, slug) values ('Free Co', 'free-co') returning id into c2;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1110', 'Bank', 'asset', 'current_asset') returning id into bank;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4100', 'Sales', 'revenue', 'operating_revenue') returning id into rev;
  lines := jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '10', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '10'));

  -- a company without periods is not restricted
  insert into public.accounts (company_id, code, name, type, subtype) values (c2, '1110', 'Bank', 'asset', 'current_asset') returning id into b2;
  y := public.kd_fiscal_year_create(c, date '2026-01-01', 'FY2026');
  assert public.kd_fiscal_year_create(c, date '2026-01-01', 'FY2026') = y, 'a year is created once';
  assert (select count(*) from public.fiscal_periods where fiscal_year_id = y) = 12, 'twelve periods';
  assert (select end_date from public.fiscal_years where id = y) = date '2026-12-31', 'year end';
  assert (select end_date from public.fiscal_periods where fiscal_year_id = y and number = 2) = date '2026-02-28', 'february';
  begin perform public.kd_fiscal_year_create(c, date '2026-07-01', 'Overlap'); assert false, 'years overlap';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_fiscal_year_create(c, date '2026-01-15', 'Odd'); assert false, 'first day of a month';
  exception when invalid_parameter_value then null; end;
  -- a fiscal year that starts in April
  perform public.kd_fiscal_year_create(c2, date '2026-04-01', 'FY2026-27');
  assert (select end_date from public.fiscal_years where company_id = c2) = date '2027-03-31', 'april year';

  -- open period: posting works
  r := public.kd_journal_create(c, date '2026-03-10', 'March sale', 'manual', null, null, null, lines, null, 'posted');
  assert r->>'number' is not null, 'posted in an open period';
  -- an unposted entry stops the close
  perform public.kd_journal_create(c, date '2026-03-12', 'Draft', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '3', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '3')), null, 'draft');
  select id into p from public.fiscal_periods where fiscal_year_id = y and number = 3;
  begin perform public.kd_period_close(c, p, null, 'x'); assert false, 'close with a draft';
  exception when object_not_in_prerequisite_state then null; end;
  update public.journal_entries set deleted_at = now() where memo = 'Draft' and company_id = c;
  r := public.kd_period_close(c, p, null, 'Checked');
  assert not (r->>'replay')::boolean, 'closed';
  assert (public.kd_period_close(c, p, null, 'Again')->>'replay')::boolean, 'closing twice is a replay';
  begin perform public.kd_journal_create(c, date '2026-03-20', 'Late', 'manual', null, null, null, lines, null, 'posted'); assert false, 'closed period';
  exception when sqlstate 'KD002' then null; end;
  assert (select count(*) from public.journal_entries where memo = 'Late') = 0, 'nothing left behind';
  -- drafts can still be made in a closed period but not posted
  perform public.kd_journal_create(c, date '2026-03-20', 'Late draft', 'manual', null, null, null, lines, null, 'draft', true);
  -- another period is open
  perform public.kd_journal_create(c, date '2026-04-05', 'April', 'manual', null, null, null, lines, null, 'posted', true);
  -- module lock
  update public.fiscal_periods set ar_closed = true where fiscal_year_id = y and number = 4;
  begin perform public.kd_journal_create(c, date '2026-04-06', 'Invoice', 'system', 'invoice', 'i9', 'invoice:i9:sent', lines, null, 'posted'); assert false, 'receivables locked';
  exception when sqlstate 'KD002' then null; end;
  perform public.kd_journal_create(c, date '2026-04-06', 'Manual still works', 'manual', null, null, null, lines, null, 'posted', true);
  -- lock date
  insert into public.accounting_settings (company_id, lock_date) values (c, date '2026-05-31');
  begin perform public.kd_journal_create(c, date '2026-05-15', 'Behind the lock', 'manual', null, null, null, lines, null, 'posted', true); assert false, 'lock date';
  exception when sqlstate 'KD002' then null; end;
  perform public.kd_journal_create(c, date '2026-06-15', 'After the lock', 'manual', null, null, null, lines, null, 'posted', true);
  -- reopen
  r := public.kd_period_reopen(c, p, null, 'Fix an error');
  assert (select reopen_count from public.fiscal_periods where id = p) = 1 and (select status from public.fiscal_periods where id = p) = 'open', 'reopened';
  assert (select ar_closed from public.fiscal_periods where id = p) = false, 'locks cleared';
  update public.fiscal_years set status = 'closed', closed_at = now() where id = y;
  perform public.kd_period_close(c, (select id from public.fiscal_periods where fiscal_year_id = y and number = 7), null, 'x');
  begin perform public.kd_period_reopen(c, (select id from public.fiscal_periods where fiscal_year_id = y and number = 7), null, 'Year is closed'); assert false, 'reopen in a closed year';
  exception when object_not_in_prerequisite_state then null; end;
  update public.fiscal_years set status = 'open', closed_at = null where id = y;

  -- closing entries are left out of the period balances
  update public.accounting_settings set lock_date = null where company_id = c;
  perform public.kd_journal_create(c, date '2026-06-20', 'Close', 'system', 'year_end', 'y', 'yearend:y', jsonb_build_array(jsonb_build_object('account_id', rev, 'debit', '10', 'credit', '0'), jsonb_build_object('account_id', bank, 'debit', '0', 'credit', '10')), null, 'posted', true, '', null, null, 'closing');
  select coalesce(sum(debit), 0) into d from public.kd_period_balances(c, date '2026-06-01', date '2026-06-30') where account_id = rev;
  assert d = 0, 'closing entries are not in the balances';
  select coalesce(sum(credit), 0) into d from public.kd_period_balances(c, date '2026-06-01', date '2026-06-30') where account_id = rev;
  assert d = 10, 'normal entries are';
  -- no restriction without periods
  perform public.kd_journal_create(c2, date '2020-01-01', 'Old', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', b2, 'debit', '1', 'credit', '0'), jsonb_build_object('account_id', b2, 'debit', '0', 'credit', '1')), null, 'draft');
end
$$;
