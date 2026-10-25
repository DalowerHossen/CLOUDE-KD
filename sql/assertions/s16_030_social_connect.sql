-- path: sql/assertions/s16_030_social_connect.sql
-- Social connect sessions: RLS on, one session per state hash, only a 64 character hash is accepted.
do $$
declare cid uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname = 'social_connect_sessions' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Connect co', 'connect-co') returning id into cid;
  insert into public.social_connect_sessions (company_id, user_id, state_hash, expires_at)
    values (cid, gen_random_uuid(), repeat('a', 64), now() + interval '15 minutes');
  begin
    insert into public.social_connect_sessions (company_id, user_id, state_hash, expires_at)
      values (cid, gen_random_uuid(), repeat('a', 64), now() + interval '15 minutes');
    assert false, 'the same state made a second session';
  exception when unique_violation then null; end;
  begin
    insert into public.social_connect_sessions (company_id, user_id, state_hash, expires_at)
      values (cid, gen_random_uuid(), 'short', now() + interval '15 minutes');
    assert false, 'a short hash was accepted';
  exception when check_violation then null; end;
end $$;
