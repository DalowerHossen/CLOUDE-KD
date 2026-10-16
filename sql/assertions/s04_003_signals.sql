-- path: sql/assertions/s04_003_signals.sql
-- Risk scores add, clamp and decay; fraud signals are immutable; device reuse and multi-account counts; closed to clients.
do $$
declare s numeric; d jsonb; u1 uuid := public.uuid_generate_v7(); u2 uuid := public.uuid_generate_v7(); h text := repeat('a', 64); fp text := repeat('f', 64);
begin
  assert public.kd_risk_get('ip', 'x') = 0, 'unknown subject has no risk';
  s := public.kd_risk_add('login_failed', 'ip', 'x', 30, null, '{}');
  assert s = 30, 'first signal';
  s := public.kd_risk_add('login_failed', 'ip', 'x', 80, null, '{}');
  assert s = 100, 'score is clamped at 100';
  assert (select factors ->> 'login_failed' from public.risk_scores where subject_ref = 'x') = '2', 'factor counter';
  update public.risk_scores set scored_at = now() - interval '2 days' where subject_ref = 'x';
  s := public.kd_risk_get('ip', 'x');
  assert s between 80 and 82, 'two days of decay is about 19 percent: ' || s::text;
  assert public.kd_risk_add('good_behaviour', 'ip', 'x', -50, null, '{}') between 30 and 32, 'negative signals lower the score';
  assert public.kd_risk_clear('ip', 'x'), 'clear';
  assert public.kd_risk_get('ip', 'x') = 0, 'cleared';

  begin update public.fraud_signals set score_delta = 0; assert false, 'update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.fraud_signals; assert false, 'delete allowed';
  exception when insufficient_privilege then null; end;

  d := public.kd_device_seen(u1, null, repeat('d', 64), fp, h, 'DE');
  assert (d ->> 'isNew')::boolean and (d ->> 'usersOnFingerprint')::int = 1, 'first sight';
  d := public.kd_device_seen(u1, null, repeat('d', 64), fp, h, 'DE');
  assert not (d ->> 'isNew')::boolean and (d ->> 'seenCount')::int = 2, 'second sight';
  d := public.kd_device_seen(u2, null, repeat('e', 64), fp, h, 'DE');
  assert (d ->> 'usersOnFingerprint')::int = 2, 'device reuse by a second account';
  assert public.kd_last_country(u1) ->> 'country' = 'DE', 'last country';

  insert into auth.users (id, email) values (u1, 'a@example.com'), (u2, 'b@example.com') on conflict do nothing;
  insert into public.auth_login_events (identifier_hash, user_id, event_type, ip_hash) values
    (repeat('1', 64), u1, 'login_success', h), (repeat('2', 64), u2, 'login_success', h), (repeat('3', 64), null, 'signup', h);
  assert public.kd_users_for_ip(h, 24) = 2, 'two accounts on one address';
  assert public.kd_signups_for_ip(h, 24) = 1, 'sign-ups on one address';

  perform public.kd_risk_add('csrf_failure', 'ip', 'z', 5, null, '{}');
  perform public.kd_risk_add('csrf_failure', 'ip', 'z', 5, null, '{}');
  assert public.kd_signal_count('ip', 'z', 'csrf_failure', 5) = 2, 'signal count inside the window';
  assert public.kd_signal_count('ip', 'z', 'xss_attempt', 5) = 0, 'other types are not counted';
  assert public.kd_signal_count('ip', 'other', 'csrf_failure', 5) = 0, 'other subjects are not counted';

  set local role authenticated;
  begin perform public.kd_risk_add('x', 'ip', 'y', 1, null, null); assert false, 'authenticated writes risk';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.risk_scores; assert false, 'authenticated reads risk';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
