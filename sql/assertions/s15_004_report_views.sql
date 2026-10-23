-- path: sql/assertions/s15_004_report_views.sql
-- Report functions: balances count posted entries only, a date range limits them, closing entries are optional, the
-- monthly function groups by month and leaves closing entries out, other companies are not mixed in, is_cash defaults to false.
do $$
declare
  c uuid; o uuid; bank uuid; rev uuid; ob uuid; d numeric; cr numeric; n integer;
begin
  insert into public.companies (name, slug) values ('Report Co', 'report-co') returning id into c;
  insert into public.companies (name, slug) values ('Other Co', 'report-other') returning id into o;
  insert into public.accounts (company_id, code, name, type, subtype, is_cash) values (c, '1110', 'Bank', 'asset', 'current_asset', true) returning id into bank;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4100', 'Sales', 'revenue', 'operating_revenue') returning id into rev;
  insert into public.accounts (company_id, code, name, type, subtype) values (o, '1110', 'Bank', 'asset', 'current_asset') returning id into ob;
  assert (select is_cash from public.accounts where id = rev) = false, 'is_cash defaults to false';
  perform public.kd_journal_create(c, date '2026-01-10', 'Jan', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '100', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '100')), null, 'posted');
  perform public.kd_journal_create(c, date '2026-02-10', 'Feb', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '50', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '50')), null, 'posted');
  perform public.kd_journal_create(c, date '2026-02-12', 'Draft', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '7', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '7')), null, 'draft');
  perform public.kd_journal_create(c, date '2026-02-28', 'Close', 'system', 'year_end', 'y', 'yearend:y', jsonb_build_array(jsonb_build_object('account_id', rev, 'debit', '150', 'credit', '0'), jsonb_build_object('account_id', bank, 'debit', '0', 'credit', '150')), null, 'posted', true, '', null, null, 'closing');
  perform public.kd_journal_create(o, date '2026-01-10', 'Other', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', ob, 'debit', '9', 'credit', '0'), jsonb_build_object('account_id', ob, 'debit', '0', 'credit', '9')), null, 'posted');
  select debit, credit into d, cr from public.kd_ledger_balances(c, null, null, false) where account_id = bank;
  assert d = 150 and cr = 0, 'drafts and closing entries are left out';
  select debit, credit into d, cr from public.kd_ledger_balances(c, null, null, true) where account_id = bank;
  assert d = 150 and cr = 150, 'closing entries can be included';
  select debit into d from public.kd_ledger_balances(c, date '2026-02-01', date '2026-02-28', false) where account_id = bank;
  assert d = 50, 'a date range limits the sums';
  select count(*) into n from public.kd_ledger_balances(c, null, null, true) where account_id = ob;
  assert n = 0, 'other companies are not mixed in';
  select count(*) into n from public.kd_ledger_monthly(c, date '2026-01-01', date '2026-12-31');
  assert n = 4, 'two months and two accounts';
  select credit into cr from public.kd_ledger_monthly(c, date '2026-01-01', date '2026-12-31') where month = '2026-02' and account_id = rev;
  assert cr = 50, 'monthly sums leave closing entries out';
end
$$;
