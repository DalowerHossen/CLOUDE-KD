-- path: sql/assertions/s09_017_client_hooks.sql
-- Client balances follow the invoices; merging clients moves sent documents and nothing else about them changes; the
-- merge allowance never lets other fields of a sent document change.
do $$
declare
  c uuid; a uuid; b uuid; inv1 uuid; inv2 uuid; est uuid; cn uuid; r jsonb; pay uuid := gen_random_uuid();
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Hook Co', 'hook-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Alpha') returning id into a;
  insert into public.clients (company_id, name) values (c, 'Alpha Twin') returning id into b;
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, sent_at, due_date, issue_date)
    values (c, a, bill, 1000, 1000, 'sent', 'INV-1', now(), current_date - 5, current_date - 35) returning id into inv1;
  assert (select outstanding_balance from public.clients where id = a) = 1000, 'balance follows a sent invoice';
  perform public.kd_invoice_mark_overdue(current_date);
  assert (select overdue_balance from public.clients where id = a) = 1000, 'overdue follows the sweep';
  perform * from public.kd_invoice_apply_payment(inv1, pay, 400);
  assert (select outstanding_balance from public.clients where id = a) = 600 and (select last_payment_at is not null from public.clients where id = a), 'balance follows a payment';
  insert into public.invoices (company_id, client_id, bill_to, total, amount_due, status, number, sent_at, due_date, issue_date)
    values (c, b, bill, 250, 250, 'sent', 'INV-2', now(), current_date + 5, current_date) returning id into inv2;
  insert into public.estimates (company_id, client_id, input, total, valid_until, status, number) values (c, b, '{"lines":[{"description":"x"}]}', 10, current_date + 5, 'sent', 'EST-1') returning id into est;
  insert into public.credit_notes (company_id, client_id, invoice_id, reason, bill_to, options, lines, total, status, number) values (c, b, inv2, 'goodwill', bill, '{}', '[{"description":"x"}]', 20, 'issued', 'CN-1') returning id into cn;

  -- without the merge, a sent invoice cannot change client
  begin update public.invoices set client_id = a where id = inv2; assert false, 'sent invoice is fixed';
  exception when insufficient_privilege then null; end;
  begin update public.estimates set client_id = a where id = est; assert false, 'sent estimate is fixed';
  exception when insufficient_privilege then null; end;
  begin update public.credit_notes set client_id = a where id = cn; assert false, 'issued credit note is fixed';
  exception when insufficient_privilege then null; end;

  r := public.kd_invoice_merge_client(c, b, a);
  assert (r ->> 'invoices')::int = 1 and (r ->> 'estimates')::int = 1 and (r ->> 'creditNotes')::int = 1, 'documents moved: ' || r::text;
  assert (select client_id from public.invoices where id = inv2) = a, 'invoice now belongs to the kept client';
  assert (select outstanding_balance from public.clients where id = a) = 850, 'kept client balance is the sum';
  assert (select outstanding_balance from public.clients where id = b) = 0, 'removed client has nothing left';
  -- the allowance is gone after the merge
  begin update public.invoices set client_id = b where id = inv2; assert false, 'guard is back';
  exception when insufficient_privilege then null; end;
  -- and even while merging, other fields stay fixed
  perform set_config('kd.merge_client', 'on', true);
  begin update public.invoices set client_id = b, total = 1 where id = inv2; assert false, 'only the client may change';
  exception when insufficient_privilege then null; end;
  perform set_config('kd.merge_client', 'off', true);
  begin perform public.kd_invoice_merge_client(c, a, a); assert false, 'not into itself';
  exception when invalid_parameter_value then null; end;
end
$$;
