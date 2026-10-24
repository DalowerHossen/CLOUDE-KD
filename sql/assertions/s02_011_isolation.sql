-- path: sql/assertions/s02_011_isolation.sql
-- Whole-schema checks: RLS forced on every public table, two tenants, no cross-read and no cross-write on any table
-- that carries company_id, anon sees nothing, audit tables are immutable for every role.
do $$
declare
  ca uuid := public.uuid_generate_v7();
  cb uuid := public.uuid_generate_v7();
  ua uuid := public.uuid_generate_v7();
  ub uuid := public.uuid_generate_v7();
  t record; n bigint; rid uuid; checked int := 0;
begin
  -- 1. RLS enabled and forced on every table of the public schema
  for t in select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r' and c.relpersistence = 'p'
  loop
    assert t.relrowsecurity, 'RLS not enabled on ' || t.relname;
    assert t.relforcerowsecurity, 'RLS not forced on ' || t.relname;
  end loop;

  -- 2. seed two tenants with data in the main tables
  insert into auth.users (id, email) values (ua, 'iso-a@example.com'), (ub, 'iso-b@example.com');
  insert into public.companies (id, name, slug) values (ca, 'IsoA', 'iso-a'), (cb, 'IsoB', 'iso-b');
  insert into public.profiles (company_id, user_id, email) values (ca, ua, 'iso-a@example.com'), (cb, ub, 'iso-b@example.com');
  insert into public.memberships (company_id, user_id, role) values (ca, ua, 'owner'), (cb, ub, 'owner');
  perform public.kd_audit_append(cb, ub, 'owner', null, 'invoice.created', 'invoice', null, null, null, null, null, '{}');
  rid := public.kd_approval_create(cb, 'invoice.void', '{}', ub, 'owner', 'L2', 24);
  insert into public.consent_records_platform (company_id, subject_hash, purpose, policy_version, text_hash) values (cb, repeat('1', 64), 'marketing', 'v1', repeat('2', 64));
  insert into public.dsar_requests (company_id, request_type, subject_user_id, subject_hash, due_at) values (cb, 'export', ub, repeat('3', 64), now() + interval '30 days');
  perform public.kd_enqueue_job(cb, 'a.b', '{}');
  perform public.kd_publish_event(cb, 'invoice.created', '{}');

  -- 3. tenant A: nothing of tenant B is readable or writable in any table with company_id
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'app_metadata', json_build_object('company_id', ca, 'role', 'owner'))::text, true);
  set local role authenticated;
  for t in select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'company_id' order by 1
  loop
    checked := checked + 1;
    begin
      execute format('select count(*) from public.%I where company_id = $1', t.table_name) into n using cb;
      assert n = 0, 'cross-tenant read on ' || t.table_name;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('update public.%I set company_id = company_id where company_id = $1', t.table_name) using cb;
      get diagnostics n = row_count;
      assert n = 0, 'cross-tenant update on ' || t.table_name;
    exception when insufficient_privilege or others then
      if sqlerrm like 'cross-tenant%' then raise; end if;
    end;
    begin
      execute format('delete from public.%I where company_id = $1', t.table_name) using cb;
      get diagnostics n = row_count;
      assert n = 0, 'cross-tenant delete on ' || t.table_name;
    exception when insufficient_privilege or others then
      if sqlerrm like 'cross-tenant%' then raise; end if;
    end;
  end loop;
  assert checked >= 15, 'expected at least 15 tenant tables, found ' || checked;
  reset role;

  -- 4. anon sees nothing anywhere
  set local role anon;
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1
  loop
    begin
      execute format('select count(*) from public.%I', t.table_name) into n;
      assert n = 0, 'anon can read ' || t.table_name;
    exception when insufficient_privilege then null;
    end;
  end loop;
  reset role;

  -- 5. audit tables are immutable for every role
  perform public.kd_audit_append(ca, ua, 'owner', null, 'invoice.created', 'invoice', null, null, null, null, null, '{}');
  for t in select unnest(array['postgres_like', 'service_role', 'authenticated', 'anon']) as r loop
    if t.r = 'postgres_like' then
      begin update public.audit_logs set action = 'x.y'; assert false, 'update allowed for superuser';
      exception when insufficient_privilege then null; end;
      begin delete from public.audit_logs; assert false, 'delete allowed for superuser';
      exception when insufficient_privilege then null; end;
    else
      execute format('set local role %I', t.r);
      begin update public.audit_logs set action = 'x.y'; assert false, 'update allowed for ' || t.r;
      exception when insufficient_privilege then null; end;
      begin delete from public.audit_logs; assert false, 'delete allowed for ' || t.r;
      exception when insufficient_privilege then null; end;
      reset role;
    end if;
  end loop;
end
$$;
