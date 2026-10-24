-- path: sql/assertions/s03_lock_state.sql
-- REQ-LOCK: persistence, shared counter, 2 failures = 2 hours, no unlock by success or reset, reset token rules, hooks.
do $$
declare
  id1 text := repeat('1', 64);
  id2 text := repeat('2', 64);
  u uuid := public.uuid_generate_v7();
  r jsonb; ok boolean; tok text := repeat('e', 64); got uuid; n int;
begin
  insert into auth.users (id, email) values (u, 'lock@example.com');

  -- unknown account behaves like any other: failures are counted, nothing reveals existence
  r := public.kd_lock_check(id2);
  assert not (r ->> 'locked')::boolean and (r ->> 'failureCount')::int = 0, 'fresh identifier is free';
  r := public.kd_lock_record_failure(id2, null, null, 'password', 2, 7200);
  assert not (r ->> 'locked')::boolean and (r ->> 'failureCount')::int = 1, 'first failure counted';
  r := public.kd_lock_record_failure(id2, null, null, 'password', 2, 7200);
  assert (r ->> 'locked')::boolean and (r ->> 'justLocked')::boolean, 'second failure locks (unknown account too)';

  -- known account: one failure of each kind share the counter
  r := public.kd_lock_record_failure(id1, u, null, 'password', 2, 7200);
  assert (r ->> 'failureCount')::int = 1, 'one password failure';
  r := public.kd_lock_record_failure(id1, u, null, 'two_factor', 2, 7200);
  assert (r ->> 'locked')::boolean, 'password plus 2FA failure locks';
  assert r ->> 'lockReason' = 'mixed', 'reason is mixed';
  assert (select locked_until from public.auth_login_state where identifier_hash = id1) > now() + interval '119 minutes', 'lock lasts about 2 hours';
  assert (select locked_until from public.auth_login_state where identifier_hash = id1) <= now() + interval '121 minutes', 'lock is not longer than 2 hours';

  -- while locked: success is refused, failures are not counted again, state survives (it is just a table row)
  ok := public.kd_lock_record_success(id1, u, null);
  assert not ok, 'a correct password does not log in while locked';
  r := public.kd_lock_record_failure(id1, u, null, 'password', 2, 7200);
  assert (r ->> 'failureCount')::int = 2 and not (r ->> 'justLocked')::boolean, 'no extra counting while locked';
  assert (public.kd_lock_check(id1) ->> 'locked')::boolean, 'check reports the lock';

  -- reset is disabled while locked and old tokens die when a lock starts
  assert not public.kd_reset_token_issue(id1, u, tok, 3600), 'no reset token while locked';
  assert public.kd_reset_token_consume(id1, tok) is null, 'no consume while locked';
  perform public.kd_reset_token_issue(repeat('3', 64), u, tok, 3600);
  assert public.kd_reset_token_consume(repeat('3', 64), repeat('f', 64)) is null, 'wrong token refused';
  r := public.kd_lock_record_failure(repeat('3', 64), u, null, 'password', 1, 7200);
  assert (select reset_token_hash from public.auth_login_state where identifier_hash = repeat('3', 64)) is null, 'lock start invalidates the token';

  -- the lock is an auth server concern too: the access token hook refuses
  r := public.kd_auth_access_token_hook(jsonb_build_object('user_id', u, 'claims', '{}'::jsonb));
  assert r -> 'error' ->> 'http_code' = '403', 'token hook refuses a locked user';
  r := public.kd_auth_password_hook(jsonb_build_object('user_id', u));
  assert r ->> 'decision' = 'reject', 'password hook rejects';

  perform public.kd_lock_unlock(repeat('3', 64));

  -- expiry frees the account and starts a fresh counter
  update public.auth_login_state set locked_until = now() - interval '1 second' where identifier_hash = id1;
  r := public.kd_lock_check(id1);
  assert not (r ->> 'locked')::boolean and (r ->> 'failureCount')::int = 0, 'expired lock is free with a fresh counter';
  r := public.kd_lock_record_failure(id1, u, null, 'password', 2, 7200);
  assert (r ->> 'failureCount')::int = 1 and not (r ->> 'locked')::boolean, 'fresh count after expiry';
  r := public.kd_auth_access_token_hook(jsonb_build_object('user_id', u, 'claims', '{"a":1}'::jsonb));
  assert r -> 'claims' ->> 'a' = '1', 'token hook passes claims when free';

  -- a full success resets the counter; reset token is single use
  assert public.kd_lock_record_success(id1, u, null), 'success when free';
  assert (public.kd_lock_check(id1) ->> 'failureCount')::int = 0, 'success resets the counter';
  assert public.kd_reset_token_issue(id1, u, tok, 3600), 'token issued when free';
  got := public.kd_reset_token_consume(id1, tok);
  assert got = u, 'token consumed once';
  assert public.kd_reset_token_consume(id1, tok) is null, 'token is single use';

  -- unlock clears everything
  perform public.kd_lock_record_failure(id1, u, null, 'password', 1, 7200);
  assert (public.kd_lock_check(id1) ->> 'locked')::boolean, 'locked again';
  assert public.kd_lock_unlock(id1), 'unlock';
  assert not (public.kd_lock_check(id1) ->> 'locked')::boolean, 'free after unlock';

  -- ip failure counting uses hashes only
  insert into public.auth_login_events (identifier_hash, event_type, ip_hash) values (id1, 'login_failed', repeat('9', 64)), (id1, 'login_failed', repeat('9', 64));
  assert public.kd_ip_failures(repeat('9', 64), 900) = 2, 'ip failures counted';

  -- closed to clients
  set local role authenticated;
  begin perform public.kd_lock_unlock(id1); assert false, 'authenticated can unlock';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_lock_record_failure(id1, null, null, 'password', 2, 7200); assert false, 'authenticated can record';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
