-- path: sql/assertions/s02_003_locks.sql
-- Lease locks and versioned update.
do $$
declare
  o1 uuid := public.uuid_generate_v7();
  o2 uuid := public.uuid_generate_v7();
  c uuid := public.uuid_generate_v7();
  v int;
begin
  assert public.kd_acquire_lease('k1', o1, 30), 'first owner acquires';
  assert not public.kd_acquire_lease('k1', o2, 30), 'second owner is refused';
  assert public.kd_release_lease('k1', o1), 'owner releases';
  assert public.kd_acquire_lease('k1', o2, 30), 'free after release';
  assert not public.kd_release_lease('k1', o1), 'non owner cannot release';

  insert into public.companies (id, name, slug) values (c, 'L', 'l-co');
  v := public.kd_update_with_version('companies', c, 1, '{"name":"L2"}'::jsonb);
  assert v = 2, 'version incremented';
  begin
    perform public.kd_update_with_version('companies', c, 1, '{"name":"L3"}'::jsonb);
    assert false, 'stale version must fail';
  exception when sqlstate '40001' then null;
  end;
  begin
    perform public.kd_update_with_version('companies', c, 2, '{"company_id":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    assert false, 'protected column must be rejected';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.kd_update_with_version('lock_leases', c, 1, '{"lock_key":"x"}'::jsonb);
    assert false, 'unknown row must conflict';
  exception when sqlstate '40001' then null;
  end;
  begin
    perform public.kd_update_with_version('pg_class', c, 1, '{"relname":"x"}'::jsonb);
    assert false, 'non public tables rejected';
  exception when sqlstate '22023' then null;
  end;
end
$$;
