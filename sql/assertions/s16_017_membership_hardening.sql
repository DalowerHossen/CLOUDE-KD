-- path: sql/assertions/s16_017_membership_hardening.sql
-- A signed-in owner cannot write memberships through the table API (only the service role does), but can still read them.
do $$
declare ca uuid; ua uuid; ub uuid; n integer;
begin
  insert into public.companies (name, slug) values ('Member Co', 'member-co') returning id into ca;
  insert into auth.users (id) values (public.uuid_generate_v7()) returning id into ua;
  insert into auth.users (id) values (public.uuid_generate_v7()) returning id into ub;
  insert into public.memberships (company_id, user_id, role) values (ca, ua, 'owner');
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'app_metadata', json_build_object('company_id', ca, 'role', 'owner'))::text, true);
  set local role authenticated;
  begin
    insert into public.memberships (company_id, user_id, role) values (ca, ub, 'staff');
    assert false, 'an owner cannot add a membership through the table API';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.memberships set status = 'suspended' where company_id = ca;
    assert false, 'an owner cannot change a membership through the table API';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.memberships where company_id = ca;
  assert n = 1, 'the owner still reads the memberships of the company';
  reset role;
end $$;
