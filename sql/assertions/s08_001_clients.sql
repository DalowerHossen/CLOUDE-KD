-- path: sql/assertions/s08_001_clients.sql
-- Clients: standard columns, value checks, one primary contact, contact replace is atomic, custom fields unique per key.
do $$
declare
  c uuid; c2 uuid; k uuid; n integer;
begin
  insert into public.companies (name, slug) values ('Client Co', 'client-co') returning id into c;
  insert into public.companies (name, slug) values ('Other Co', 'other-co') returning id into c2;
  insert into public.clients (company_id, name, email, billing_postal_code, billing_country) values (c, 'Acme Ltd', 'billing@acme.test', '12345', 'US') returning id into k;
  begin insert into public.clients (company_id, name, email) values (c, 'Bad Mail', 'Not An Email'); assert false, 'e-mail format';
  exception when check_violation then null; end;
  begin insert into public.clients (company_id, name, billing_country) values (c, 'Bad Country', 'u1'); assert false, 'country code';
  exception when check_violation then null; end;
  begin insert into public.clients (company_id, name, credit_balance) values (c, 'Negative Credit', -1); assert false, 'credit balance not negative';
  exception when check_violation then null; end;
  begin insert into public.clients (company_id, name, status) values (c, 'Odd', 'deleted'); assert false, 'known status';
  exception when check_violation then null; end;
  begin insert into public.clients (company_id, name, custom_fields) values (c, 'Array Fields', '[]'::jsonb); assert false, 'custom fields object';
  exception when check_violation then null; end;
  n := public.kd_client_contacts_replace(c, k, '[{"name":"Ann","email":"ann@acme.test"},{"name":"Bob","role":"Finance"}]'::jsonb);
  assert n = 2, 'two contacts';
  assert (select count(*) from public.client_contacts where client_id = k and is_primary and deleted_at is null) = 1, 'one primary';
  begin perform public.kd_client_contacts_replace(c2, k, '[]'::jsonb); assert false, 'another company cannot replace contacts';
  exception when sqlstate '22023' then null; end;
  n := public.kd_client_contacts_replace(c, k, '[{"name":"Cy"}]'::jsonb);
  assert (select count(*) from public.client_contacts where client_id = k and deleted_at is null) = 1, 'replaced';
  insert into public.custom_field_defs (company_id, entity, key, label, kind) values (c, 'client', 'account_manager', 'Account manager', 'text');
  begin insert into public.custom_field_defs (company_id, entity, key, label, kind) values (c, 'client', 'account_manager', 'Again', 'text'); assert false, 'one definition per key';
  exception when unique_violation then null; end;
  begin insert into public.custom_field_defs (company_id, entity, key, label, kind) values (c, 'client', 'tier', 'Tier', 'select'); assert false, 'select needs options';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.clients', 'select'), 'closed to clients';
  assert (select relrowsecurity from pg_class where oid = 'public.clients'::regclass), 'rls on';
end
$$;
