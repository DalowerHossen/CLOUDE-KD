-- path: migrations/S16_018_function_privileges.sql
-- Audit finding S8: functions get EXECUTE for PUBLIC by default, so signed-in and anonymous callers of the table API could call
-- internal helpers (job claims, usage counters, guards) directly. Every function of the public schema is closed to PUBLIC, anon
-- and authenticated and opened to the service role, except the few that policies, column defaults and check constraints call
-- while a signed-in user works on a table.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname in ('app_company_id', 'app_role', 'app_is_platform', 'app_is_super_admin', 'uuid_generate_v7', 'is_snake_token', 'kd_unique_array') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Functions made by later migrations start closed too; one that a signed-in user must call is granted by its own migration.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
