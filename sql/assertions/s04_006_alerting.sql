-- path: sql/assertions/s04_006_alerting.sql
-- Alerts: dedupe window, silence (not for critical), escalation, acknowledge. Incidents: lifecycle, post-mortem rule, timeline, metrics.
do $$
declare
  r jsonb; r2 jsonb; i uuid; cnt int; u uuid := public.uuid_generate_v7();
begin
  r := public.kd_alert_raise('auth.brute_force.ip', 'high', 'Brute force', 'x', 'k1', null, 300, 900);
  assert (r->>'isNew')::boolean and (r->>'notify')::boolean, 'first alert notifies';
  r2 := public.kd_alert_raise('auth.brute_force.ip', 'high', 'Brute force', 'x', 'k1', null, 300, 900);
  assert not (r2->>'isNew')::boolean and not (r2->>'notify')::boolean, 'repeat inside the window is counted, not sent';
  assert (select occurrences from public.alerts where dedupe_key = 'k1') = 2, 'occurrences counted';
  update public.alerts set notified_at = now() - interval '6 minutes' where dedupe_key = 'k1';
  r2 := public.kd_alert_raise('auth.brute_force.ip', 'high', 'Brute force', 'x', 'k1', null, 300, 900);
  assert (r2->>'notify')::boolean, 'notifies again after the window';
  r2 := public.kd_alert_raise('auth.brute_force.ip', 'critical', 'Brute force', 'x', 'k1', null, 300, 900);
  assert (select severity from public.alerts where dedupe_key = 'k1') = 'critical', 'severity only goes up';

  insert into public.alert_silences (rule_id, reason, ends_at) values ('noisy.rule', 'maintenance', now() + interval '1 hour');
  r := public.kd_alert_raise('noisy.rule', 'medium', 'Noisy', '', 'k2', null, 300, 900);
  assert (r->>'silenced')::boolean and not (r->>'notify')::boolean, 'silence mutes medium';
  r := public.kd_alert_raise('noisy.rule', 'critical', 'Noisy', '', 'k3', null, 300, 900);
  assert not (r->>'silenced')::boolean and (r->>'notify')::boolean, 'critical is never silenced';
  begin insert into public.alert_silences (rule_id, reason, ends_at) values ('*', 'too long', now() + interval '8 days'); assert false, 'silence limited to 7 days';
  exception when check_violation then null; end;

  update public.alerts set next_escalation_at = now() - interval '1 minute' where dedupe_key = 'k1';
  select count(*) into cnt from public.kd_alert_escalate(900);
  assert cnt = 1, 'unacknowledged alert escalates';
  assert (select escalation_level from public.alerts where dedupe_key = 'k1') = 1, 'level 1';
  assert public.kd_alert_ack((select id from public.alerts where dedupe_key = 'k1'), u), 'acknowledge';
  update public.alerts set next_escalation_at = now() - interval '1 minute' where dedupe_key = 'k1';
  select count(*) into cnt from public.kd_alert_escalate(900);
  assert cnt = 0, 'acknowledged alerts do not escalate';
  assert public.kd_alert_resolve((select id from public.alerts where dedupe_key = 'k1')), 'resolve';
  r := public.kd_alert_raise('auth.brute_force.ip', 'high', 'Brute force', 'x', 'k1', null, 300, 900);
  assert (r->>'isNew')::boolean, 'a resolved alert does not absorb a new one';

  insert into public.incidents (title, severity, started_at, detected_at) values ('Leak', 'SEV1', now() - interval '20 minutes', now() - interval '10 minutes') returning id into i;
  begin perform public.kd_incident_transition(i, 'mitigating', u, ''); assert false, 'cannot skip acknowledgement';
  exception when invalid_parameter_value then null; end;
  assert public.kd_incident_transition(i, 'acknowledged', u, 'on it'), 'acknowledge';
  assert (select commander_user_id from public.incidents where id = i) = u, 'first responder is commander';
  assert public.kd_incident_transition(i, 'resolved', u, 'fixed'), 'resolve';
  begin perform public.kd_incident_transition(i, 'closed', u, ''); assert false, 'SEV1 needs a post-mortem';
  exception when invalid_parameter_value then null; end;
  update public.incidents set postmortem = 'Root cause and actions are written here in full.' where id = i;
  assert public.kd_incident_transition(i, 'closed', u, ''), 'close with post-mortem';
  begin perform public.kd_incident_transition(i, 'acknowledged', u, ''); assert false, 'closed is final';
  exception when invalid_parameter_value then null; end;
  select count(*) into cnt from public.incident_events where incident_id = i;
  assert cnt = 3, 'timeline has every move';
  begin update public.incident_events set body = 'x' where incident_id = i; assert false, 'timeline is append-only';
  exception when assert_failure then raise; when others then null; end;
  r := public.kd_incident_metrics(30);
  assert (r->>'total')::int = 1 and (r->>'mttd_minutes')::numeric = 10.0, 'MTTD is 10 minutes';
  assert not has_function_privilege('authenticated', 'public.kd_alert_raise(text, text, text, text, text, uuid, integer, integer)', 'execute'), 'service role only';
end
$$;
