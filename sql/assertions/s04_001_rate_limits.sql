-- path: sql/assertions/s04_001_rate_limits.sql
-- Atomic rate counter, windows, IP blocks, immutable security events, idempotency states, closed to clients.
do $$
declare r jsonb; i int; h text := repeat('a', 64); eid uuid;
begin
  for i in 1..5 loop r := public.kd_rate_limit_hit('k1', 5, 60); end loop;
  assert (r ->> 'allowed')::boolean and (r ->> 'remaining')::int = 0, 'fifth hit is allowed';
  r := public.kd_rate_limit_hit('k1', 5, 60);
  assert not (r ->> 'allowed')::boolean and (r ->> 'retryAfterSeconds')::int between 1 and 60, 'sixth hit is refused with Retry-After';
  assert (public.kd_rate_limit_hit('k2', 5, 60) ->> 'allowed')::boolean, 'other key is independent';
  update public.rate_limits set window_start = now() - interval '2 days';
  assert public.kd_rate_limit_purge() >= 2, 'old windows are purged';

  assert not public.kd_ip_is_blocked(h), 'not blocked at first';
  perform public.kd_ip_block(h, '10.0.0.0/24', 'brute force', 900, false, null);
  assert public.kd_ip_is_blocked(h), 'blocked';
  perform public.kd_ip_block(h, '10.0.0.0/24', 'again', 60, false, null);
  assert (select blocked_until from public.ip_blocks where ip_hash = h and deleted_at is null) > now() + interval '10 minutes', 'a shorter ban never shortens the longer one';
  assert public.kd_ip_unblock(h), 'unblock';
  assert not public.kd_ip_is_blocked(h), 'free after unblock';
  perform public.kd_ip_block(h, null, 'abuse', 1, true, null);
  update public.ip_blocks set blocked_until = null where ip_hash = h and deleted_at is null;
  assert public.kd_ip_is_blocked(h), 'permanent block';

  eid := public.kd_security_event(null, 'csrf_failure', 'medium', 'proxy', null, h, null, '{"x":1}', 'c1');
  begin update public.security_events set severity = 'low' where id = eid; assert false, 'update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.security_events; assert false, 'delete allowed';
  exception when insufficient_privilege then null; end;

  r := public.kd_idempotency_begin('s', 'key-0123456789abcdef', repeat('1', 64), null);
  assert r ->> 'state' = 'new', 'first call is new';
  assert public.kd_idempotency_begin('s', 'key-0123456789abcdef', repeat('1', 64), null) ->> 'state' = 'in_progress', 'running';
  assert public.kd_idempotency_begin('s', 'key-0123456789abcdef', repeat('2', 64), null) ->> 'state' = 'conflict', 'different request body conflicts';
  assert public.kd_idempotency_complete('s', 'key-0123456789abcdef', 201, '{"ok":true}', 'application/json'), 'complete';
  r := public.kd_idempotency_begin('s', 'key-0123456789abcdef', repeat('1', 64), null);
  assert r ->> 'state' = 'replay' and (r ->> 'status')::int = 201 and r ->> 'body' = '{"ok":true}', 'replay returns the stored answer';
  assert public.kd_idempotency_begin('s2', 'key-0123456789abcdef', repeat('1', 64), null) ->> 'state' = 'new', 'scope separates keys';
  assert public.kd_idempotency_release('s2', 'key-0123456789abcdef'), 'release frees a failed attempt';
  assert public.kd_idempotency_begin('s2', 'key-0123456789abcdef', repeat('1', 64), null) ->> 'state' = 'new', 'free again after release';
  update public.api_idempotency set expires_at = now() - interval '1 second' where scope = 's';
  assert public.kd_idempotency_begin('s', 'key-0123456789abcdef', repeat('1', 64), null) ->> 'state' = 'new', 'expired key is reusable';

  set local role authenticated;
  begin perform public.kd_rate_limit_hit('x', 1, 1); assert false, 'authenticated can hit';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.ip_blocks; assert false, 'authenticated reads blocks';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_security_event(null, 'x', 'info', 'x', null, null, null, null, null); assert false, 'authenticated writes events';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
