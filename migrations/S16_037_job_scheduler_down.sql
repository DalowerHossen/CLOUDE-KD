-- path: migrations/S16_037_job_scheduler_down.sql
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('kd-email-queue');
  end if;
exception when others then null;
end
$$;
drop function if exists public.kd_cron_ping(text);
