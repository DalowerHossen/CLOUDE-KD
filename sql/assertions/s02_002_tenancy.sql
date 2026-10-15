-- path: sql/assertions/s02_002_tenancy.sql
-- Two tenants: no cross-read, no cross-write on tenancy tables; shared tables are read-only.
do $$
declare
  ca uuid := public.uuid_generate_v7();
  cb uuid := public.uuid_generate_v7();
  ua uuid := public.uuid_generate_v7();
  ub uuid := public.uuid_generate_v7();
  n int;
begin
  insert into auth.users (id, email) values (ua, 'a@example.com'), (ub, 'b@example.com');
  insert into public.companies (id, name, slug) values (ca, 'A', 'a-co'), (cb, 'B', 'b-co');
  insert into public.profiles (company_id, user_id, email) values (ca, ua, 'a@example.com'), (cb, ub, 'b@example.com');
  insert into public.memberships (company_id, user_id, role) values (ca, ua, 'owner'), (cb, ub, 'owner');
  assert (select company_id from public.companies where id = ca) = ca, 'company_id must equal id';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'app_metadata', json_build_object('company_id', ca, 'role', 'owner'))::text, true);
  set local role authenticated;

  select count(*) into n from public.companies; assert n = 1, 'tenant A sees only its company';
  select count(*) into n from public.companies where id = cb; assert n = 0, 'tenant A must not read company B';
  select count(*) into n from public.profiles where company_id = cb; assert n = 0, 'no cross-read profiles';
  select count(*) into n from public.memberships where company_id = cb; assert n = 0, 'no cross-read memberships';

  update public.companies set name = 'hacked' where id = cb;
  get diagnostics n = row_count; assert n = 0, 'no cross-write companies';
  update public.companies set name = 'A2' where id = ca;
  get diagnostics n = row_count; assert n = 1, 'owner updates own company';

  begin
    insert into public.memberships (company_id, user_id, role) values (cb, ua, 'staff');
    assert false, 'cross-tenant membership insert must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.memberships (company_id, user_id, role) values (ca, ub, 'owner');
    assert false, 'owner cannot create another owner';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.companies set plan_key = 'enterprise' where id = ca;
    assert false, 'plan_key is not writable by tenants';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.roles; assert n = 5, 'roles readable and seeded';
  begin
    insert into public.roles (key, label, scope, rank) values ('staff', 'x', 'tenant', 5);
    assert false, 'roles are read-only for authenticated';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.feature_flags (key, enabled) values ('x', true);
    assert false, 'only super_admin writes flags';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
  select count(*) into n from public.companies; assert n = 0, 'no claims means no rows';
  reset role;
end
$$;
