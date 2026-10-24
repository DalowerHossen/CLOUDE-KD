-- path: sql/assertions/s13_008_disputes.sql
-- Disputes: RLS on, one case per processor event and per processor dispute, closed status needs a closing time,
-- evidence and history are logs, one waiting refund request per payment.
do $$
declare c uuid; cl uuid; inv uuid; pay uuid; d uuid; n integer; r uuid;
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname in ('disputes', 'dispute_evidence', 'dispute_events', 'refund_requests') and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Dispute Co', 'dispute-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Client') returning id into cl;
  insert into public.invoices (company_id, client_id, status, issue_date, due_date, bill_to) values (c, cl, 'sent', current_date, current_date, '{}'::jsonb) returning id into inv;
  insert into public.payments (company_id, invoice_id, client_id, amount, idempotency_key, status) values (c, inv, cl, 100, 'key-12345678', 'captured') returning id into pay;

  insert into public.disputes (company_id, payment_id, invoice_id, client_id, processor_id, processor_dispute_id, source_event_id, amount, due_at)
    values (c, pay, inv, cl, 'stripe', 'dp_1', 'evt_1', 100, now() + interval '7 days') returning id into d;
  begin insert into public.disputes (company_id, payment_id, invoice_id, processor_id, processor_dispute_id, source_event_id, amount, due_at)
    values (c, pay, inv, 'stripe', 'dp_2', 'evt_1', 100, now()); assert false, 'same event twice';
  exception when unique_violation then null; end;
  begin insert into public.disputes (company_id, payment_id, invoice_id, processor_id, processor_dispute_id, source_event_id, amount, due_at)
    values (c, pay, inv, 'stripe', 'dp_1', 'evt_2', 100, now()); assert false, 'same dispute twice';
  exception when unique_violation then null; end;
  begin update public.disputes set status = 'won' where id = d; assert false, 'closed without time';
  exception when check_violation then null; end;
  update public.disputes set status = 'won', closed_at = now() where id = d;
  begin update public.disputes set status = 'unknown' where id = d; assert false, 'status list';
  exception when check_violation then null; end;
  begin insert into public.disputes (company_id, payment_id, invoice_id, processor_id, source_event_id, amount, due_at, reason_category)
    values (c, pay, inv, 'stripe', 'evt_3', 100, now(), 'weather'); assert false, 'reason list';
  exception when check_violation then null; end;

  insert into public.dispute_evidence (company_id, dispute_id, kind, title, content) values (c, d, 'note', 'Client confirmed by phone', 'Called on Monday');
  begin insert into public.dispute_evidence (company_id, dispute_id, kind, title) values (c, d, 'file', 'No file'); assert false, 'file without a file id';
  exception when check_violation then null; end;
  begin update public.dispute_evidence set title = 'Changed'; assert false, 'evidence edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  insert into public.dispute_events (company_id, dispute_id, kind) values (c, d, 'opened');
  begin delete from public.dispute_events; assert false, 'history deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;

  insert into public.refund_requests (company_id, payment_id, invoice_id, client_id, amount, reason) values (c, pay, inv, cl, 50, 'Service not delivered') returning id into r;
  begin insert into public.refund_requests (company_id, payment_id, invoice_id, amount, reason) values (c, pay, inv, 20, 'Second ask'); assert false, 'two waiting requests';
  exception when unique_violation then null; end;
  begin update public.refund_requests set status = 'approved' where id = r; assert false, 'decided without time';
  exception when check_violation then null; end;
  update public.refund_requests set status = 'denied', decided_at = now(), deny_reason = 'Outside policy' where id = r;
  insert into public.refund_requests (company_id, payment_id, invoice_id, amount, reason) values (c, pay, inv, 20, 'Ask again after a denial');
end
$$;
