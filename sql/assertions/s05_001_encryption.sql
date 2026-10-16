-- path: sql/assertions/s05_001_encryption.sql
-- Secret access log is append-only and checked; rotation runs are constrained; both tables are closed to clients.
do $$
declare
  id1 uuid;
begin
  insert into public.secret_access_log (purpose, operation, key_version) values ('oauth-tokens', 'decrypt', 1) returning id into id1;
  begin update public.secret_access_log set key_version = 2 where id = id1; assert false, 'update allowed';
  exception when assert_failure then raise; when others then null; end;
  begin delete from public.secret_access_log where id = id1; assert false, 'delete allowed';
  exception when assert_failure then raise; when others then null; end;
  begin insert into public.secret_access_log (purpose, operation, key_version) values ('other', 'decrypt', 1); assert false, 'purpose checked';
  exception when check_violation then null; end;
  begin insert into public.secret_access_log (purpose, operation, key_version) values ('pii', 'decrypt', 9); assert false, 'version checked';
  exception when check_violation then null; end;
  begin insert into public.key_rotation_runs (table_name, column_name, purpose, to_version) values ('x; drop table y', 'c', 'pii', 2); assert false, 'identifier checked';
  exception when check_violation then null; end;
  begin insert into public.key_rotation_runs (table_name, column_name, purpose, to_version) values ('t', 'c', 'pii', 1); assert false, 'rotation target above 1';
  exception when check_violation then null; end;
  assert (select relrowsecurity from pg_class where oid = 'public.secret_access_log'::regclass), 'rls on log';
  assert (select relrowsecurity from pg_class where oid = 'public.key_rotation_runs'::regclass), 'rls on runs';
  assert not has_table_privilege('authenticated', 'public.secret_access_log', 'select'), 'closed to clients';
end
$$;
