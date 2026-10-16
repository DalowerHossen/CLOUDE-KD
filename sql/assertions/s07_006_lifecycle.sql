-- path: sql/assertions/s07_006_lifecycle.sql
-- Data requests: kinds and states checked, one open closure and one running export per company, claiming hands out each request once.
do $$
declare
  c uuid;
  u uuid := gen_random_uuid();
  n integer;
begin
  insert into public.companies (name, slug) values ('Life Test', 'life-test') returning id into c;
  insert into public.data_requests (company_id, kind, requested_by) values (c, 'export', u);
  begin insert into public.data_requests (company_id, kind, requested_by) values (c, 'export', u); assert false, 'one export in progress';
  exception when unique_violation then null; end;
  insert into public.data_requests (company_id, kind, requested_by) values (c, 'backup', u);
  begin insert into public.data_requests (company_id, kind, requested_by) values (c, 'delete', u); assert false, 'kind checked';
  exception when check_violation then null; end;
  begin insert into public.data_requests (company_id, kind, requested_by, status) values (c, 'export', u, 'paused'); assert false, 'status checked';
  exception when check_violation then null; end;
  insert into public.data_requests (company_id, kind, requested_by, scheduled_for) values (c, 'closure', u, now() + interval '30 days');
  begin insert into public.data_requests (company_id, kind, requested_by, scheduled_for) values (c, 'closure', u, now() + interval '30 days'); assert false, 'one open closure';
  exception when unique_violation then null; end;
  select count(*) into n from public.kd_data_request_claim(10);
  assert n = 2, 'export and backup are claimed, the closure is not';
  select count(*) into n from public.kd_data_request_claim(10);
  assert n = 0, 'a request is handed out once';
  update public.data_requests set status = 'ready' where company_id = c and kind = 'export';
  insert into public.data_requests (company_id, kind, requested_by) values (c, 'export', u);
  assert not has_table_privilege('authenticated', 'public.data_requests', 'select'), 'closed to clients';
end
$$;
