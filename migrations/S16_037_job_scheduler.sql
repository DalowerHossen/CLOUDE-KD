-- path: migrations/S16_037_job_scheduler.sql
-- The database clock calls the app's job route: the e-mail queue every minute, so held and scheduled messages go out without
-- a scheduler on the host. The address and the job secret are read from the vault, never kept in this file. Safe to run twice.

-- pg_net exists on Supabase; plain PostgreSQL used for local checks may not ship it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

-- One call to POST /api/cron/<job>. Returns false (and does nothing) while the vault has no address or secret yet.
create or replace function public.kd_cron_ping(p_job text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  base text;
  secret text;
begin
  if p_job is null or p_job !~ '^[a-z][a-z0-9-]{1,60}$' then
    raise exception 'bad job name' using errcode = '22023';
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'app_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'cron_secret';
  if base is null or secret is null or char_length(secret) < 32 then
    return false;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 20000)'
    using rtrim(base, '/') || '/api/cron/' || p_job,
      jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
      '{}'::jsonb;
  return true;
end
$$;

revoke all on function public.kd_cron_ping(text) from public, anon, authenticated;

-- The e-mail queue, every minute. Only when pg_cron is there.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('kd-email-queue', '* * * * *', $job$select public.kd_cron_ping('email-queue')$job$);
  end if;
end
$$;
