-- path: sql/assertions/s03_001_auth_tables.sql
-- Auth tables: closed to clients except own non-secret rows, append-only login events, session revoke function.
do $$
declare
  ca uuid := public.uuid_generate_v7();
  cb uuid := public.uuid_generate_v7();
  u1 uuid := public.uuid_generate_v7();
  u2 uuid := public.uuid_generate_v7();
  u3 uuid := public.uuid_generate_v7();
  h text := repeat('a', 64);
  n int;
begin
  insert into auth.users (id, email) values (u1, 'o@example.com'), (u2, 's@example.com'), (u3, 'x@example.com');
  insert into public.companies (id, name, slug) values (ca, 'A', 'au-a'), (cb, 'B', 'au-b');
  insert into public.two_factor_factors (company_id, user_id, secret_encrypted, status) values (ca, u2, '{"c":"x"}', 'active');
  insert into public.backup_codes (company_id, user_id, code_hash) values (ca, u2, repeat('b', 64));
  insert into public.user_sessions (company_id, user_id, expires_at) values (ca, u2, now() + interval '1 day'), (cb, u3, now() + interval '1 day');
  insert into public.auth_login_events (identifier_hash, user_id, event_type) values (h, u2, 'login_success');
  insert into public.auth_login_state (identifier_hash, user_id) values (h, u2);

  -- staff user: own rows, no secrets
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'app_metadata', json_build_object('company_id', ca, 'role', 'staff'))::text, true);
  set local role authenticated;
  select count(*) into n from public.two_factor_factors; assert n = 1, 'own factor status visible';
  begin perform secret_encrypted from public.two_factor_factors; assert false, 'secret column readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.backup_codes; assert false, 'backup codes readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.auth_login_state; assert false, 'lock state readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.password_history; assert false, 'password history readable';
  exception when insufficient_privilege then null; end;
  begin insert into public.user_sessions (company_id, user_id, expires_at) values (ca, u2, now()); assert false, 'client insert session';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.user_sessions; assert n = 1, 'staff sees only own session';
  select count(*) into n from public.auth_login_events; assert n = 1, 'own login events';
  reset role;

  -- owner of company A sees staff sessions of A but not of B
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'app_metadata', json_build_object('company_id', ca, 'role', 'owner'))::text, true);
  set local role authenticated;
  select count(*) into n from public.user_sessions; assert n = 1, 'owner sees company sessions only';
  reset role;

  -- append-only login events
  begin update public.auth_login_events set event_type = 'logout'; assert false, 'update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.auth_login_events; assert false, 'delete allowed';
  exception when insufficient_privilege then null; end;

  -- revoke function
  n := public.kd_revoke_user_sessions(u2, null, 'test');
  assert n = 1, 'one session revoked';
  assert (select revoked_at from public.user_sessions where user_id = u2) is not null, 'revoked_at set';

  -- one factor per user, one lock state per identifier
  begin insert into public.two_factor_factors (company_id, user_id, secret_encrypted) values (ca, u2, '{}'); assert false, 'second factor';
  exception when unique_violation then null; end;
  begin insert into public.auth_login_state (identifier_hash) values (h); assert false, 'duplicate identifier';
  exception when unique_violation then null; end;
end
$$;

-- single session revoke (S03_003)
do $$
declare u uuid := public.uuid_generate_v7(); s1 uuid; s2 uuid;
begin
  insert into auth.users (id, email) values (u, 'rev@example.com');
  insert into public.user_sessions (user_id, expires_at) values (u, now() + interval '1 day') returning id into s1;
  insert into public.user_sessions (user_id, expires_at) values (u, now() + interval '1 day') returning id into s2;
  assert public.kd_revoke_session(s1, 'test'), 'revoked';
  assert not public.kd_revoke_session(s1, 'test'), 'second revoke does nothing';
  assert (select revoked_at from public.user_sessions where id = s2) is null, 'other session untouched';
  update public.user_sessions set step_up_at = now() where id = s2;
  assert (select step_up_at from public.user_sessions where id = s2) is not null, 'step_up_at column';
end
$$;
