-- path: sql/assertions/s04_004_tokens.sql
-- Token storage, one-time code attempts and lock, leak counter, immutable events, tenant isolation.
do $$
declare
  c uuid := public.uuid_generate_v7(); cb uuid := public.uuid_generate_v7(); t uuid; u uuid := public.uuid_generate_v7(); n int; r text;
begin
  insert into public.companies (id, name, slug) values (c, 'T', 'tok-a'), (cb, 'T2', 'tok-b');
  insert into public.access_tokens (company_id, doc_type, doc_id, token_hash, expires_at, ttl_days, otp_required)
  values (c, 'invoice', public.uuid_generate_v7(), repeat('a', 64), now() + interval '30 days', 30, true) returning id into t;
  begin insert into public.access_tokens (company_id, doc_type, doc_id, token_hash, expires_at, ttl_days) values (c, 'invoice', public.uuid_generate_v7(), repeat('a', 64), now(), 1);
    assert false, 'duplicate hash';
  exception when unique_violation then null; end;

  assert public.kd_token_otp_set(t, repeat('1', 64), 300), 'code set';
  assert public.kd_token_otp_check(t, repeat('2', 64)) = 'wrong', 'wrong code';
  assert public.kd_token_otp_check(t, repeat('1', 64)) = 'ok', 'right code';
  assert public.kd_token_otp_check(t, repeat('1', 64)) = 'expired', 'a code works once';
  assert public.kd_token_otp_set(t, repeat('1', 64), 300), 'new code';
  for n in 1..4 loop r := public.kd_token_otp_check(t, repeat('3', 64)); end loop;
  assert r = 'wrong', 'four wrong codes';
  assert public.kd_token_otp_check(t, repeat('3', 64)) = 'locked', 'fifth wrong code locks the gate';
  assert public.kd_token_otp_check(t, repeat('1', 64)) = 'locked', 'even the right code is refused while locked';
  assert not public.kd_token_otp_set(t, repeat('1', 64), 300), 'no new code while locked';
  update public.access_tokens set otp_locked_until = now() - interval '1 second' where id = t;
  assert public.kd_token_otp_set(t, repeat('1', 64), 300), 'code possible after the lock';

  update public.access_tokens set otp_expires_at = now() - interval '1 second' where id = t;
  assert public.kd_token_otp_check(t, repeat('1', 64)) = 'expired', 'code expires after 5 minutes';

  for n in 1..6 loop perform public.kd_token_touch(t, repeat(n::text, 64)); end loop;
  assert public.kd_token_touch(t, repeat('1', 64)) = 6, 'distinct addresses are counted for leak detection';
  assert (select use_count from public.access_tokens where id = t) = 7, 'use count';

  assert public.kd_token_revoke(t), 'revoke';
  assert not public.kd_token_revoke(t), 'revoke twice does nothing';
  assert public.kd_token_otp_check(t, repeat('1', 64)) = 'invalid', 'revoked token has no code gate';

  begin update public.token_events set event = 'issued'; assert false, 'update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.token_events; assert false, 'delete allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'app_metadata', json_build_object('company_id', cb, 'role', 'owner'))::text, true);
  set local role authenticated;
  select count(*) into n from public.access_tokens; assert n = 0, 'other tenant sees no tokens';
  begin perform token_hash from public.access_tokens; assert false, 'hash column readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.token_events; assert false, 'events readable';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_token_revoke(t); assert false, 'function open';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
