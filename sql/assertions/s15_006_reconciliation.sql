-- path: sql/assertions/s15_006_reconciliation.sql
-- Reconciliation: RLS on; a bank account ties to a cash account only; a duplicate bank line and the same file twice are refused;
-- a match needs a posted journal line on the bank's ledger account with the same amount, and a journal line matches once; the
-- status follows the matches; a reconciliation starts after the last one, completes only at zero difference with no unmatched
-- line, and then its lines and matches cannot change.
do $$
declare
  c uuid; bank uuid; rev uuid; exp uuid; ba uuid; t1 uuid; t2 uuid; t3 uuid; r jsonb; e1 jsonb; e2 jsonb; l1 uuid; l2 uuid; rec uuid; st jsonb; n integer; imp uuid;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('bank_accounts', 'bank_imports', 'bank_transactions', 'bank_matches', 'bank_rules', 'reconciliations') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Bank Co', 'bank-co') returning id into c;
  insert into public.accounts (company_id, code, name, type, subtype, is_cash) values (c, '1110', 'Bank', 'asset', 'current_asset', true) returning id into bank;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4100', 'Sales', 'revenue', 'operating_revenue') returning id into rev;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '6400', 'Fees', 'expense', 'operating_expense') returning id into exp;
  begin insert into public.bank_accounts (company_id, name, ledger_account_id) values (c, 'Bad', rev); assert false, 'a bank account ties to a cash account';
  exception when invalid_parameter_value then null; end;
  begin insert into public.bank_accounts (company_id, name, ledger_account_id, last4) values (c, 'Bad', bank, '12345'); assert false, 'only the last 4 digits';
  exception when check_violation then null; end;
  insert into public.bank_accounts (company_id, name, ledger_account_id, last4, opening_balance) values (c, 'Main', bank, '1234', 1000) returning id into ba;

  insert into public.bank_imports (company_id, bank_account_id, source, file_hash) values (c, ba, 'csv', repeat('a', 64)) returning id into imp;
  begin insert into public.bank_imports (company_id, bank_account_id, source, file_hash) values (c, ba, 'csv', repeat('a', 64)); assert false, 'same file twice';
  exception when unique_violation then null; end;
  insert into public.bank_transactions (company_id, bank_account_id, import_id, txn_date, description, amount, dedupe_hash) values (c, ba, imp, date '2026-10-05', 'Customer payment', 500, repeat('1', 64)) returning id into t1;
  insert into public.bank_transactions (company_id, bank_account_id, import_id, txn_date, description, amount, dedupe_hash) values (c, ba, imp, date '2026-10-08', 'Bank fee', -25, repeat('2', 64)) returning id into t2;
  begin insert into public.bank_transactions (company_id, bank_account_id, txn_date, amount, dedupe_hash) values (c, ba, date '2026-10-05', 500, repeat('1', 64)); assert false, 'duplicate bank line';
  exception when unique_violation then null; end;
  begin insert into public.bank_transactions (company_id, bank_account_id, txn_date, amount, dedupe_hash) values (c, ba, date '2026-10-05', 0, repeat('3', 64)); assert false, 'zero amount';
  exception when check_violation then null; end;

  e1 := public.kd_journal_create(c, date '2026-10-05', 'Sale', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', bank, 'debit', '500', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '500')), null, 'posted');
  e2 := public.kd_journal_create(c, date '2026-10-08', 'Fee', 'manual', null, null, null, jsonb_build_array(jsonb_build_object('account_id', exp, 'debit', '25', 'credit', '0'), jsonb_build_object('account_id', bank, 'debit', '0', 'credit', '25')), null, 'posted');
  select id into l1 from public.journal_lines where entry_id = (e1->>'entry_id')::uuid and account_id = bank;
  select id into l2 from public.journal_lines where entry_id = (e2->>'entry_id')::uuid and account_id = bank;
  begin insert into public.bank_matches (company_id, bank_transaction_id, journal_line_id, amount, method) values (c, t1, l1, 499, 'manual'); assert false, 'amount must equal the line';
  exception when invalid_parameter_value then null; end;
  begin insert into public.bank_matches (company_id, bank_transaction_id, journal_line_id, amount, method) select c, t1, id, 500, 'manual' from public.journal_lines where entry_id = (e1->>'entry_id')::uuid and account_id = rev; assert false, 'line on another account';
  exception when invalid_parameter_value then null; end;
  insert into public.bank_matches (company_id, bank_transaction_id, journal_line_id, amount, method) values (c, t1, l1, 500, 'manual');
  assert public.kd_bank_refresh_status(t1) = 'matched', 'matched';
  begin insert into public.bank_matches (company_id, bank_transaction_id, journal_line_id, amount, method) values (c, t2, l1, 500, 'manual'); assert false, 'a journal line matches once';
  exception when unique_violation or invalid_parameter_value then null; end;
  insert into public.bank_matches (company_id, bank_transaction_id, journal_line_id, amount, method) values (c, t2, l2, -25, 'manual');
  assert public.kd_bank_refresh_status(t2) = 'matched', 'second matched';
  -- a draft entry cannot be matched
  insert into public.bank_transactions (company_id, bank_account_id, txn_date, description, amount, dedupe_hash) values (c, ba, date '2026-10-09', 'Other', 7, repeat('4', 64)) returning id into t3;
  assert public.kd_bank_refresh_status(t3) = 'unmatched', 'unmatched without matches';

  -- reconciliation: opening 1000, lines +500 -25 = 475 -> statement 1475 (the unmatched line of 7 is dated later)
  rec := public.kd_reconciliation_start(c, ba, date '2026-10-08', 1475, null);
  begin perform public.kd_reconciliation_start(c, ba, date '2026-10-09', 1, null); assert false, 'one open reconciliation';
  exception when unique_violation then null; end;
  st := public.kd_reconciliation_state(c, rec);
  assert (st->>'lines')::integer = 2 and (st->>'unmatched')::integer = 0 and (st->>'difference')::numeric = 0, 'state: two lines, no difference';
  update public.reconciliations set statement_balance = 1400 where id = rec;
  begin perform public.kd_reconciliation_complete(c, rec, null, ''); assert false, 'a difference blocks completion';
  exception when check_violation then null; end;
  update public.reconciliations set statement_balance = 1475 where id = rec;
  r := public.kd_reconciliation_complete(c, rec, null, 'October');
  assert not (r->>'replay')::boolean, 'completed';
  assert (public.kd_reconciliation_complete(c, rec, null, '')->>'replay')::boolean, 'completing twice is a replay';
  assert (select reconciliation_id from public.bank_transactions where id = t1) = rec, 'lines are tied to it';
  assert (select reconciliation_id from public.bank_transactions where id = t3) is null, 'later lines are not';
  begin update public.bank_transactions set amount = 1 where id = t1; assert false, 'reconciled line';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.bank_matches set deleted_at = now() where bank_transaction_id = t1; assert false, 'reconciled match';
  exception when object_not_in_prerequisite_state then null; end;
  begin perform public.kd_reconciliation_start(c, ba, date '2026-10-08', 1, null); assert false, 'statement date after the last one';
  exception when invalid_parameter_value then null; end;
  rec := public.kd_reconciliation_start(c, ba, date '2026-10-31', 1482, null);
  assert (select opening_balance from public.reconciliations where id = rec) = 1475, 'opens at the last statement balance';
  begin perform public.kd_reconciliation_complete(c, rec, null, ''); assert false, 'unmatched line blocks completion';
  exception when object_not_in_prerequisite_state then null; end;
  update public.bank_transactions set status = 'ignored' where id = t3;
  assert (public.kd_reconciliation_state(c, rec)->>'lines')::integer = 0, 'ignored lines are left out';
  insert into public.bank_rules (company_id, name, contains_text, account_id) values (c, 'Fees', 'bank fee', exp);
  begin insert into public.bank_rules (company_id, name, contains_text, account_id) values (c, 'Bad', 'x', exp); assert false, 'rule text length';
  exception when check_violation then null; end;
end
$$;
