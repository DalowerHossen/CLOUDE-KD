-- path: sql/assertions/s15_001_chart_journals.sql
-- Chart and journals: RLS on, account rules (unique code, parent of the same type, system account protected), a balanced
-- entry posts and gets a number, an unbalanced or one-sided entry is refused, lines and posted entries cannot change, a
-- posted entry cannot be removed, reversal works once, the same source key is a replay, a duplicate manual entry is
-- flagged, the trial balance adds up to zero.
do $$
declare
  c uuid; bank uuid; rev uuid; grp uuid; sysacc uuid; r jsonb; r2 jsonb; e uuid; n integer; d numeric; cr numeric;
  lines jsonb;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('accounts', 'account_history', 'account_mappings', 'journal_counters', 'journal_entries', 'journal_lines', 'journal_templates', 'journal_attachments') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Journal Co', 'journal-co') returning id into c;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1110', 'Bank', 'asset', 'current_asset') returning id into bank;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4100', 'Sales', 'revenue', 'operating_revenue') returning id into rev;
  insert into public.accounts (company_id, code, name, type, subtype, is_system, system_key) values (c, '1130', 'Receivable', 'asset', 'current_asset', true, 'accounts_receivable') returning id into sysacc;
  assert (select normal_side from public.accounts where id = bank) = 'debit' and (select normal_side from public.accounts where id = rev) = 'credit', 'normal side';
  begin insert into public.accounts (company_id, code, name, type, subtype) values (c, '1110', 'Again', 'asset', 'current_asset'); assert false, 'duplicate code';
  exception when unique_violation then null; end;
  begin insert into public.accounts (company_id, code, name, type, subtype) values (c, '9999', 'Bad', 'asset', 'operating_revenue'); assert false, 'type and subtype must fit';
  exception when check_violation then null; end;
  insert into public.accounts (company_id, code, name, type, subtype, allow_posting) values (c, '4000', 'Revenue group', 'revenue', 'operating_revenue', false) returning id into grp;
  begin insert into public.accounts (company_id, code, name, type, subtype, parent_id) values (c, '1111', 'Child', 'asset', 'current_asset', grp); assert false, 'parent of another type';
  exception when invalid_parameter_value then null; end;
  begin update public.accounts set code = '1131' where id = sysacc; assert false, 'system account code';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.accounts where id = sysacc; assert (select deleted_at from public.accounts where id = sysacc) is null, 'system account removed'; exception when object_not_in_prerequisite_state then null; end;

  lines := jsonb_build_array(
    jsonb_build_object('account_id', bank, 'debit', '100.0000', 'credit', '0'),
    jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '100.0000'));
  r := public.kd_journal_create(c, date '2026-10-01', 'Cash sale', 'manual', null, null, null, lines, null, 'posted');
  assert r->>'number' = 'JE-2026-000001', 'first number';
  assert (select status from public.journal_entries where id = (r->>'entry_id')::uuid) = 'posted', 'posted';
  -- same date and lines again: flagged
  begin perform public.kd_journal_create(c, date '2026-10-01', 'Cash sale again', 'manual', null, null, null, lines, null, 'draft'); assert false, 'duplicate';
  exception when sqlstate 'KD001' then null; end;
  r2 := public.kd_journal_create(c, date '2026-10-01', 'Cash sale again', 'manual', null, null, null, lines, null, 'draft', true);
  e := (r2->>'entry_id')::uuid;
  assert (select duplicate_of from public.journal_entries where id = e) = (r->>'entry_id')::uuid, 'duplicate is linked to the first entry';
  -- unbalanced
  begin perform public.kd_journal_create(c, date '2026-10-02', 'Bad', 'manual', null, null, null, jsonb_build_array(
      jsonb_build_object('account_id', bank, 'debit', '10', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '9')), null, 'posted');
    assert false, 'unbalanced';
  exception when check_violation then null; end;
  assert (select count(*) from public.journal_entries where memo = 'Bad') = 0, 'nothing left behind';
  -- a line with both sides, a group account
  begin insert into public.journal_lines (company_id, entry_id, line_no, account_id, debit, credit) values (c, e, 9, bank, 1, 1); assert false, 'both sides';
  exception when check_violation then null; end;
  begin insert into public.journal_lines (company_id, entry_id, line_no, account_id, debit) values (c, e, 9, grp, 1); assert false, 'group account';
  exception when object_not_in_prerequisite_state then null; end;
  -- replace the lines of the draft
  perform public.kd_journal_replace(c, e, (select version from public.journal_entries where id = e), date '2026-10-03', 'Moved', '', jsonb_build_array(
      jsonb_build_object('account_id', bank, 'debit', '50', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '50')), null);
  assert (select count(*) from public.journal_lines where entry_id = e and deleted_at is null) = 2, 'replaced lines';
  begin perform public.kd_journal_replace(c, e, 1, date '2026-10-03', 'Stale', '', lines, null); assert false, 'stale version';
  exception when serialization_failure then null; end;
  -- posted entries and their lines cannot change
  begin update public.journal_lines set debit = 5 where entry_id = (r->>'entry_id')::uuid; assert false, 'posted line';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.journal_lines where entry_id = (r->>'entry_id')::uuid; assert false, 'posted line removed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.journal_entries set memo = 'x' where id = (r->>'entry_id')::uuid; assert false, 'posted entry';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.journal_entries where id = (r->>'entry_id')::uuid; assert false, 'posted entry removed';
  exception when object_not_in_prerequisite_state then null; end;
  -- posting the draft, twice
  r2 := public.kd_journal_post(c, e, null);
  assert r2->>'number' = 'JE-2026-000002', 'second number';
  assert (public.kd_journal_post(c, e, null)->>'replay')::boolean, 'post twice is a replay';
  -- a system entry with a source key: a replay the second time
  r2 := public.kd_journal_create(c, date '2026-10-04', 'Invoice', 'system', 'invoice', 'inv-1', 'invoice:inv-1:created', jsonb_build_array(
      jsonb_build_object('account_id', bank, 'debit', '30', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '30')), null, 'posted');
  assert not (r2->>'replay')::boolean, 'first';
  r2 := public.kd_journal_create(c, date '2026-10-04', 'Invoice', 'system', 'invoice', 'inv-1', 'invoice:inv-1:created', jsonb_build_array(
      jsonb_build_object('account_id', bank, 'debit', '30', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '30')), null, 'posted');
  assert (r2->>'replay')::boolean, 'second is a replay';
  assert (select count(*) from public.journal_entries where source_key = 'invoice:inv-1:created') = 1, 'one entry';
  -- reversal
  r2 := public.kd_journal_reverse(c, (r->>'entry_id')::uuid, date '2026-10-05', 'Test', null);
  assert (select reversed_by_id from public.journal_entries where id = (r->>'entry_id')::uuid) = (r2->>'entry_id')::uuid, 'linked';
  begin perform public.kd_journal_reverse(c, (r->>'entry_id')::uuid, date '2026-10-06', 'Again', null); assert false, 'reverse twice';
  exception when object_not_in_prerequisite_state then null; end;
  begin perform public.kd_journal_reverse(c, (r2->>'entry_id')::uuid, date '2026-10-06', 'Reverse the reversal', null); assert false, 'reverse a reversal';
  exception when object_not_in_prerequisite_state then null; end;
  -- an account with lines keeps its type
  begin update public.accounts set type = 'liability', subtype = 'current_liability' where id = bank; assert false, 'type change with lines';
  exception when object_not_in_prerequisite_state then null; end;
  -- trial balance adds up to zero
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, cr from public.kd_journal_balances(c, null);
  assert d = cr and d > 0, 'trial balance: debit equals credit';
  -- draft entry can be removed
  r2 := public.kd_journal_create(c, date '2026-10-07', 'Draft', 'manual', null, null, null, jsonb_build_array(
      jsonb_build_object('account_id', bank, 'debit', '7', 'credit', '0'), jsonb_build_object('account_id', rev, 'debit', '0', 'credit', '7')), null, 'draft');
  delete from public.journal_entries where id = (r2->>'entry_id')::uuid;
  assert (select deleted_at from public.journal_entries where id = (r2->>'entry_id')::uuid) is not null, 'draft removed';
  -- history is append only
  insert into public.account_history (company_id, account_id, change) values (c, bank, 'test');
  begin update public.account_history set change = 'x' where account_id = bank; assert false, 'history changed';
  exception when insufficient_privilege then null; end;
end
$$;
