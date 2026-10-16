-- path: sql/assertions/s07_005_domains.sql
-- Custom domains: valid hostnames only, one company per hostname, one primary that must be verified.
do $$
declare
  c1 uuid;
  c2 uuid;
begin
  insert into public.companies (name, slug) values ('Dom One', 'dom-one') returning id into c1;
  insert into public.companies (name, slug) values ('Dom Two', 'dom-two') returning id into c2;
  insert into public.custom_domains (company_id, hostname, verification_token) values (c1, 'billing.example.com', repeat('a', 32));
  begin insert into public.custom_domains (company_id, hostname, verification_token) values (c2, 'billing.example.com', repeat('b', 32)); assert false, 'one company per hostname';
  exception when unique_violation then null; end;
  begin insert into public.custom_domains (company_id, hostname, verification_token) values (c2, 'Billing.Example.com', repeat('b', 32)); assert false, 'lower case only';
  exception when check_violation then null; end;
  begin insert into public.custom_domains (company_id, hostname, verification_token) values (c2, 'localhost', repeat('b', 32)); assert false, 'a dotted name is needed';
  exception when check_violation then null; end;
  begin insert into public.custom_domains (company_id, hostname, verification_token) values (c2, '10.0.0.1', repeat('b', 32)); assert false, 'no IP addresses';
  exception when check_violation then null; end;
  begin insert into public.custom_domains (company_id, hostname, verification_token) values (c2, 'bad_name.example.com', repeat('b', 32)); assert false, 'letters, digits and dashes only';
  exception when check_violation then null; end;
  begin update public.custom_domains set is_primary = true where hostname = 'billing.example.com'; assert false, 'an unverified domain cannot be primary';
  exception when check_violation then null; end;
  update public.custom_domains set status = 'verified', is_primary = true where hostname = 'billing.example.com';
  insert into public.custom_domains (company_id, hostname, verification_token, status) values (c1, 'pay.example.com', repeat('c', 32), 'verified');
  begin update public.custom_domains set is_primary = true where hostname = 'pay.example.com'; assert false, 'one primary per company';
  exception when unique_violation then null; end;
  update public.custom_domains set deleted_at = now() where hostname = 'billing.example.com';
  insert into public.custom_domains (company_id, hostname, verification_token) values (c2, 'billing.example.com', repeat('d', 32));
  assert not has_table_privilege('authenticated', 'public.custom_domains', 'select'), 'closed to clients';
end
$$;
