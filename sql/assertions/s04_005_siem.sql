-- path: sql/assertions/s04_005_siem.sql
-- SIEM: cursor fetch, severity filter, correlation, indicators of compromise, one open finding per subject.
do $$
declare
  ip1 text := repeat('a', 64); ip2 text := repeat('b', 64); n int; last_id uuid; fresh boolean; cnt int; rec record;
begin
  for n in 1..5 loop
    perform public.kd_security_event(null, 'brute_force', 'high', 'app', null, ip1, '1.2.x.x', '{}'::jsonb, null);
  end loop;
  perform public.kd_security_event(null, 'network_blocked', 'low', 'app', null, ip2, '9.9.x.x', '{}'::jsonb, null);

  select count(*) into cnt from public.kd_siem_fetch(null, 'high', 100);
  assert cnt = 5, 'severity filter keeps high and above';
  select count(*) into cnt from public.kd_siem_fetch(null, 'info', 100);
  assert cnt = 6, 'all events without a cursor';
  select id into last_id from public.kd_siem_fetch(null, 'info', 100) order by id desc limit 1;
  select count(*) into cnt from public.kd_siem_fetch(last_id, 'info', 100);
  assert cnt = 0, 'nothing after the newest cursor';
  select count(*) into cnt from public.kd_siem_fetch(null, 'info', 2);
  assert cnt = 2, 'limit is respected';

  select * into rec from public.kd_siem_correlate(array['brute_force'], 'ip_hash', 60, 5);
  assert rec.subject_ref = ip1 and rec.event_count = 5, 'five events from one address correlate';
  select count(*) into cnt from public.kd_siem_correlate(array['brute_force'], 'ip_hash', 60, 6);
  assert cnt = 0, 'below threshold gives nothing';
  begin perform public.kd_siem_correlate(array['x'], 'details; drop', 60, 1); assert false, 'group column is checked';
  exception when invalid_parameter_value then null; end;

  insert into public.siem_iocs (ioc_type, value, source) values ('ip_hash', ip2, 'test feed');
  select count(*) into cnt from public.kd_siem_ioc_hits(60);
  assert cnt = 1, 'indicator matches its address only';
  update public.siem_iocs set expires_at = now() - interval '1 minute';
  select count(*) into cnt from public.kd_siem_ioc_hits(60);
  assert cnt = 0, 'expired indicator is ignored';

  fresh := public.kd_siem_open_finding('brute_force.ip', 'high', ip1, 5, now(), now(), '{}'::jsonb, null);
  assert fresh, 'first finding is new';
  fresh := public.kd_siem_open_finding('brute_force.ip', 'high', ip1, 9, now(), now(), '{}'::jsonb, null);
  assert not fresh, 'second hit updates the open finding';
  select count(*) into cnt from public.siem_findings where rule_id = 'brute_force.ip';
  assert cnt = 1 and (select event_count from public.siem_findings limit 1) = 9, 'one open finding per subject';
  update public.siem_findings set status = 'closed';
  fresh := public.kd_siem_open_finding('brute_force.ip', 'high', ip1, 5, now(), now(), '{}'::jsonb, null);
  assert fresh, 'a closed finding does not block a new one';

  begin insert into public.siem_destinations (name, kind, endpoint) values ('plain', 'splunk_hec', 'http://example.com'); assert false, 'https only';
  exception when check_violation then null; end;
  assert not has_function_privilege('authenticated', 'public.kd_siem_fetch(uuid, text, integer)', 'execute'), 'service role only';
  assert (select relrowsecurity from pg_class where oid = 'public.siem_findings'::regclass), 'rls on';
end
$$;
