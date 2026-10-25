-- path: sql/assertions/s16_023_plan_unlimited_value.sql
-- A plan feature with no limit is stored as NULL; a negative limit and a text value are still refused.
do $$
declare p uuid; n integer;
begin
  insert into public.plans (slug, name) values ('unlimited_test', 'Unlimited test') returning id into p;
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'invoices.monthly', null);
  select count(*) into n from public.plan_entitlements where plan_id = p and value is null;
  assert n = 1, 'no limit is stored as NULL';
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'clients.max', '25'::jsonb);
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'api.access', 'true'::jsonb);
  begin insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'staff.seats', '-1'::jsonb);
    assert false, 'negative limit';
  exception when check_violation then null; end;
  begin insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'storage.gigabytes', '"many"'::jsonb);
    assert false, 'text value';
  exception when check_violation then null; end;
end $$;
