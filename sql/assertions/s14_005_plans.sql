-- path: sql/assertions/s14_005_plans.sql
-- Plans: RLS on, one plan per slug, an archived plan needs its time, an entitlement value is a switch, a number or null
-- (never negative), one value per plan and key, history cannot be changed, and the usage counter adds in one step, stops
-- at the limit when asked to, and never goes below zero.
do $$
declare
  p uuid; c uuid; r jsonb; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('plans', 'plan_entitlements', 'plan_history', 'usage_counters') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.plans (slug, name) values ('starter', 'Starter') returning id into p;
  begin insert into public.plans (slug, name) values ('starter', 'Again'); assert false, 'two plans with one slug';
  exception when unique_violation then null; end;
  begin insert into public.plans (slug, name) values ('Bad Slug', 'x'); assert false, 'bad slug';
  exception when check_violation then null; end;
  begin update public.plans set status = 'archived' where id = p; assert false, 'archived needs a time';
  exception when check_violation then null; end;
  update public.plans set status = 'archived', archived_at = now() where id = p;

  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'invoices.monthly', '50'::jsonb);
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'clients.max', 'null'::jsonb);
  insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'api.access', 'true'::jsonb);
  begin insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'invoices.monthly', '60'::jsonb);
    assert false, 'two values for one key';
  exception when unique_violation then null; end;
  begin insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'staff.seats', '"many"'::jsonb);
    assert false, 'a text value';
  exception when check_violation then null; end;
  begin insert into public.plan_entitlements (plan_id, entitlement_key, value) values (p, 'storage.gigabytes', '-1'::jsonb);
    assert false, 'a negative limit';
  exception when check_violation then null; end;

  insert into public.plan_history (plan_id, action) values (p, 'created');
  begin update public.plan_history set action = 'x' where plan_id = p; assert false, 'history changed';
  exception when others then if sqlstate = 'P0004' then raise; end if; end;

  insert into public.companies (name, slug) values ('Usage Co', 'usage-co') returning id into c;
  r := public.kd_usage_add(c, 'invoices.monthly', '2026-10', 8, 10, true);
  assert (r->>'ok')::boolean and (r->>'used')::bigint = 8, 'added 8';
  r := public.kd_usage_add(c, 'invoices.monthly', '2026-10', 3, 10, true);
  assert not (r->>'ok')::boolean and (r->>'used')::bigint = 8, 'a strict add over the limit adds nothing';
  r := public.kd_usage_add(c, 'invoices.monthly', '2026-10', 3, 10, false);
  assert (r->>'ok')::boolean and (r->>'used')::bigint = 11, 'a soft add goes over';
  assert (select overage_units from public.usage_counters where company_id = c and period = '2026-10') = 1, 'one unit over the limit';
  r := public.kd_usage_add(c, 'invoices.monthly', '2026-10', -50, 10, false);
  assert (r->>'used')::bigint = 0, 'never below zero';
  r := public.kd_usage_add(c, 'clients.max', 'all', 5, null, true);
  assert (r->>'ok')::boolean, 'no limit never blocks';
  begin perform public.kd_usage_add(c, 'x.y', 'bad', 1, null, false); assert false, 'bad period';
  exception when check_violation then null; end;
end
$$;
