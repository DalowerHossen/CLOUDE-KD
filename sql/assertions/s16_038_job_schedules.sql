-- path: sql/assertions/s16_038_job_schedules.sql
-- With pg_cron present, the jobs of S16_037 and S16_038 are scheduled by their own names and each only calls the ping.
do $$
begin
  if to_regclass('cron.job') is null then return; end if;
  assert (select count(*) from cron.job where jobname like 'kd-%') >= 66, 'jobs scheduled';
  assert not exists (
    select 1 from cron.job where jobname like 'kd-%' and command not like 'select public.kd_cron_ping(%'
  ), 'only the ping';
end $$;
