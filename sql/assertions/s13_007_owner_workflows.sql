-- path: sql/assertions/s13_007_owner_workflows.sql
-- Owner workflows: a decided link request keeps its reason, a contract can hold a send request.
do $$
declare c uuid; k uuid; r uuid;
begin
  insert into public.companies (name, slug) values ('Owner Co', 'owner-co') returning id into c;
  insert into public.link_requests (company_id, token_id, doc_type, doc_id) values (c, gen_random_uuid(), 'invoice', gen_random_uuid()) returning id into r;
  update public.link_requests set status = 'denied', decided_at = now(), denied_reason = 'Not the client' where id = r;
  assert (select denied_reason from public.link_requests where id = r) = 'Not the client', 'reason kept';
  begin update public.link_requests set denied_reason = repeat('x', 501) where id = r; assert false, 'reason too long';
  exception when check_violation then null; end;
  insert into public.contracts (company_id, title, body_html) values (c, 'Needs approval', '<p>x</p>') returning id into k;
  update public.contracts set send_request_id = gen_random_uuid(), send_requested_by = gen_random_uuid(), send_message = 'Please approve' where id = k;
  assert (select send_request_id from public.contracts where id = k) is not null, 'send request kept';
  insert into public.contract_events (company_id, contract_id, kind) values (c, k, 'send_requested');
  insert into public.contract_events (company_id, contract_id, kind) values (c, k, 'send_rejected');
  begin insert into public.contract_events (company_id, contract_id, kind) values (c, k, 'teleported'); assert false, 'event kind';
  exception when check_violation then null; end;
end
$$;
