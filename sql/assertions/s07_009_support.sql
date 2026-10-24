-- path: sql/assertions/s07_009_support.sql
-- Tickets get a number, known values only; internal notes belong to agents; a company cannot read another's tickets.
do $$
declare
  c1 uuid; c2 uuid; u uuid := gen_random_uuid(); t1 uuid; t2 uuid;
  n1 text; n2 text;
begin
  insert into public.companies (name, slug) values ('Support One', 'support-one') returning id into c1;
  insert into public.companies (name, slug) values ('Support Two', 'support-two') returning id into c2;
  insert into public.support_tickets (company_id, subject, requester_id, first_response_due_at, resolution_due_at)
  values (c1, 'Cannot send invoice', u, now() + interval '1 day', now() + interval '3 days') returning id, number into t1, n1;
  insert into public.support_tickets (company_id, subject, requester_id, first_response_due_at, resolution_due_at)
  values (c2, 'Question about plans', u, now() + interval '1 day', now() + interval '3 days') returning id, number into t2, n2;
  assert n1 <> n2 and n1 ~ '^T-[0-9]{6}$', 'numbers are unique and formatted';
  begin insert into public.support_tickets (company_id, subject, priority, requester_id, first_response_due_at, resolution_due_at) values (c1, 'Priority check', 'critical', u, now(), now()); assert false, 'known priorities';
  exception when check_violation then null; end;
  begin insert into public.support_tickets (company_id, subject, requester_id, first_response_due_at, resolution_due_at) values (c1, 'ab', u, now(), now()); assert false, 'subject length';
  exception when check_violation then null; end;
  begin insert into public.support_messages (company_id, ticket_id, author_id, author_kind, internal, body) values (c1, t1, u, 'customer', true, 'secret'); assert false, 'customers cannot write internal notes';
  exception when check_violation then null; end;
  insert into public.support_messages (company_id, ticket_id, author_id, author_kind, internal, body) values (c1, t1, u, 'agent', true, 'Checked the logs.');
  insert into public.support_messages (company_id, ticket_id, author_id, author_kind, body) values (c1, t1, u, 'customer', 'Please help.');
  assert not has_table_privilege('authenticated', 'public.support_tickets', 'insert'), 'writes only through the server';
  assert (select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass), 'rls on';
end
$$;
