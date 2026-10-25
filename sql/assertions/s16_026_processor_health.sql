-- path: sql/assertions/s16_026_processor_health.sql
-- Processor health: RLS on, known statuses and processors only, one state row per processor, and the auto-disable function
-- switches off an enabled processor once and says so.
do $$
declare n integer; changed boolean;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('processor_health', 'processor_health_state') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.processor_health (processor_id, environment, status, probe, response_ms) values ('stripe', 'sandbox', 'healthy', 'adapter', 120);
  begin insert into public.processor_health (processor_id, environment, status, probe) values ('stripe', 'sandbox', 'broken', 'adapter'); assert false, 'status';
  exception when check_violation then null; end;
  begin insert into public.processor_health (processor_id, environment, status, probe) values ('nosuch', 'sandbox', 'down', 'adapter'); assert false, 'processor';
  exception when check_violation then null; end;
  insert into public.processor_health_state (processor_id) values ('stripe');
  begin insert into public.processor_health_state (processor_id) values ('stripe'); assert false, 'one state row';
  exception when unique_violation then null; end;
  begin update public.processor_health_state set consecutive_failures = -1; assert false, 'no negative counter';
  exception when check_violation then null; end;
  insert into public.processors (processor_id, enabled, credentials_version) values ('nmi', true, 1);
  changed := public.kd_processor_auto_disable('nmi', 'disabled automatically: 3 failed health checks');
  assert changed, 'first call disables';
  changed := public.kd_processor_auto_disable('nmi', 'again');
  assert not changed, 'second call changes nothing';
  assert (select disabled_reason from public.processors where processor_id = 'nmi') like 'disabled automatically%', 'reason kept';
  assert (select enabled from public.processors where processor_id = 'nmi') = false, 'now off';
end $$;
