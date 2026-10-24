-- path: migrations/S16_018_function_privileges_down.sql
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('grant execute on function %s to public', f.sig);
  end loop;
end $$;
alter default privileges in schema public grant execute on functions to public;
