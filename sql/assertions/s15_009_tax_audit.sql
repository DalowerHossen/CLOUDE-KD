-- path: sql/assertions/s15_009_tax_audit.sql
-- Tax filing and audit pack tables: RLS on; one settings row; a payment needs an amount above zero and a period that does not end
-- before it starts; a done deadline has its time; moving a deadline or reopening it restarts the reminders; an audit pack record
-- needs real checksums and never changes.
do $$
declare
  c uuid; d uuid; n integer; stage integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('tax_filing_settings', 'tax_payments', 'tax_deadlines', 'audit_packs') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Tax Co', 'tax-co') returning id into c;
  insert into public.tax_filing_settings (company_id, provision_rate) values (c, 21);
  begin insert into public.tax_filing_settings (company_id) values (c); assert false, 'one settings row';
  exception when unique_violation then null; end;
  begin insert into public.tax_filing_settings (company_id, provision_rate) values (c, 101); assert false, 'rate up to 100';
  exception when check_violation then null; end;

  begin insert into public.tax_payments (company_id, jurisdiction, period_start, period_end, amount, paid_on) values (c, 'US-CA', date '2026-01-01', date '2026-03-31', 0, date '2026-04-20'); assert false, 'amount above zero';
  exception when check_violation then null; end;
  begin insert into public.tax_payments (company_id, jurisdiction, period_start, period_end, amount, paid_on) values (c, 'US-CA', date '2026-03-31', date '2026-01-01', 5, date '2026-04-20'); assert false, 'period order';
  exception when check_violation then null; end;
  insert into public.tax_payments (company_id, jurisdiction, tax_kind, period_start, period_end, amount, paid_on) values (c, 'US-CA', 'sales', date '2026-01-01', date '2026-03-31', 500, date '2026-04-20');

  insert into public.tax_deadlines (company_id, title, due_on) values (c, 'Q1 sales tax', date '2026-04-30') returning id into d;
  update public.tax_deadlines set reminded_stage = 2 where id = d;
  update public.tax_deadlines set due_on = date '2026-05-15' where id = d;
  select reminded_stage into stage from public.tax_deadlines where id = d;
  assert stage = 0, 'moving a deadline restarts the reminders';
  begin update public.tax_deadlines set status = 'done' where id = d; assert false, 'done needs its time';
  exception when check_violation then null; end;
  update public.tax_deadlines set status = 'done', done_at = now(), reminded_stage = 2 where id = d;
  update public.tax_deadlines set status = 'open', done_at = null where id = d;
  select reminded_stage into stage from public.tax_deadlines where id = d;
  assert stage = 0, 'reopening restarts the reminders';
  begin insert into public.tax_deadlines (company_id, title, due_on, reminded_stage) values (c, 'x', date '2026-05-15', 3); assert false, 'stage 0 to 2';
  exception when check_violation then null; end;

  begin insert into public.audit_packs (company_id, period_from, period_to, manifest_sha256, file_sha256, chain_ok, entries, audit_rows, size_bytes) values (c, date '2026-01-01', date '2026-12-31', 'abc', repeat('a', 64), true, 1, 1, 1); assert false, 'checksum shape';
  exception when check_violation then null; end;
  insert into public.audit_packs (company_id, period_from, period_to, manifest_sha256, file_sha256, chain_ok, entries, audit_rows, size_bytes) values (c, date '2026-01-01', date '2026-12-31', repeat('a', 64), repeat('b', 64), true, 10, 20, 1000);
  begin update public.audit_packs set chain_ok = false where company_id = c; assert false, 'append only';
  exception when insufficient_privilege then null; end;
end
$$;
