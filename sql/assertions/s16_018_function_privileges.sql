-- path: sql/assertions/s16_018_function_privileges.sql
-- Internal functions are closed to anonymous and signed-in callers; the helpers that policies, defaults and checks use stay open
-- to signed-in users; the service role can run all of them.
do $$
declare n integer;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.proname like 'kd\_%' and p.proname <> 'kd_unique_array'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  assert n = 0, 'no internal function is open to anonymous or signed-in callers';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and not has_function_privilege('service_role', p.oid, 'execute');
  assert n = 0, 'the service role runs every function';
  assert has_function_privilege('authenticated', 'public.app_company_id()'::regprocedure, 'execute'), 'policy helper stays open';
  assert has_function_privilege('authenticated', 'public.uuid_generate_v7()'::regprocedure, 'execute'), 'id default stays open';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.proname in ('apply_standard_triggers', 'audit_enable_for', 'rls_enable_default_deny')
      and has_function_privilege('authenticated', p.oid, 'execute');
  assert n = 0, 'schema helpers are closed';
end $$;
