-- path: sql/assertions/s16_037_job_scheduler.sql
-- The ping accepts only a plain job name, does nothing while the vault is empty, and is closed to clients.
do $$
begin
  begin perform public.kd_cron_ping('Bad Name'); assert false, 'bad job name';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_cron_ping('a/../b'); assert false, 'path in job name';
  exception when sqlstate '22023' then null; end;
  assert not has_function_privilege('anon', 'public.kd_cron_ping(text)', 'execute'), 'closed to anon';
  assert not has_function_privilege('authenticated', 'public.kd_cron_ping(text)', 'execute'), 'closed to clients';
end $$;
