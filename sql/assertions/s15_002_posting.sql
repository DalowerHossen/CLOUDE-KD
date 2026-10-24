-- path: sql/assertions/s15_002_posting.sql
-- Posting log: RLS on; one row per event and rule; a posted row needs its entry; a skipped or failed row has none; only a
-- posted row can be reviewed; the company's wallet and chargeback accounts exist in the base chart keys (checked in code).
do $$
declare
  c uuid; a1 uuid; a2 uuid; r jsonb; ev uuid := public.uuid_generate_v7(); n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname = 'posting_log' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Posting Co', 'posting-co') returning id into c;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1110', 'Bank', 'asset', 'current_asset') returning id into a1;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '4100', 'Sales', 'revenue', 'operating_revenue') returning id into a2;
  r := public.kd_journal_create(c, date '2026-10-01', 'Auto', 'system', 'invoice', 'i1', 'invoice:i1:sent', jsonb_build_array(
      jsonb_build_object('account_id', a1, 'debit', '10', 'credit', '0'), jsonb_build_object('account_id', a2, 'debit', '0', 'credit', '10')), null, 'posted');
  insert into public.posting_log (company_id, event_id, event_name, rule, status, entry_id) values (c, ev, 'invoice.sent', 'invoice.sent', 'posted', (r->>'entry_id')::uuid);
  begin insert into public.posting_log (company_id, event_id, event_name, rule, status, entry_id) values (c, ev, 'invoice.sent', 'invoice.sent', 'posted', (r->>'entry_id')::uuid);
    assert false, 'one row per event and rule';
  exception when unique_violation then null; end;
  begin insert into public.posting_log (company_id, event_id, event_name, rule, status) values (c, public.uuid_generate_v7(), 'invoice.sent', 'invoice.sent', 'posted');
    assert false, 'posted needs an entry';
  exception when check_violation then null; end;
  begin insert into public.posting_log (company_id, event_id, event_name, rule, status, entry_id) values (c, public.uuid_generate_v7(), 'invoice.sent', 'invoice.sent', 'failed', (r->>'entry_id')::uuid);
    assert false, 'failed has no entry';
  exception when check_violation then null; end;
  begin insert into public.posting_log (company_id, event_id, event_name, rule, status, reviewed_at) values (c, public.uuid_generate_v7(), 'invoice.sent', 'invoice.sent', 'skipped', now());
    assert false, 'only a posted row is reviewed';
  exception when check_violation then null; end;
  update public.posting_log set reviewed_at = now() where company_id = c and event_id = ev;
  assert (select reviewed_at from public.posting_log where company_id = c and event_id = ev) is not null, 'reviewed';
end
$$;
