-- path: sql/assertions/s07_002_team.sql
-- Invitations: one open invitation per address, single use, expiry, cancelled and foreign tokens refused.
do $$
declare
  c uuid;
  u uuid := gen_random_uuid();
  boss uuid := gen_random_uuid();
  h1 text := repeat('a', 64);
  h2 text := repeat('b', 64);
  h3 text := repeat('c', 64);
  r uuid;
begin
  insert into public.companies (name, slug) values ('Team Test', 'team-test') returning id into c;
  insert into auth.users (id, email) values (u, 'staff1@example.com');
  insert into auth.users (id, email) values (boss, 'boss@example.com');
  insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by, granted_permissions)
    values (c, 'staff1@example.com', h1, now() + interval '7 days', boss, array['invoice.read']);
  begin insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by) values (c, 'staff1@example.com', h2, now() + interval '7 days', boss); assert false, 'one open invitation per address';
  exception when unique_violation then null; end;
  begin insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by) values (c, 'Staff2@Example.com', h2, now() + interval '7 days', boss); assert false, 'lower case address';
  exception when check_violation then null; end;
  begin insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by) values (c, 'staff3@example.com', 'short', now() + interval '7 days', boss); assert false, 'hash length';
  exception when check_violation then null; end;
  assert (select count(*) from public.kd_invitation_peek(h1)) = 1, 'a pending invitation can be seen';
  assert (select count(*) from public.kd_invitation_peek(h3)) = 0, 'an unknown token shows nothing';
  r := public.kd_invitation_accept(h1, u, 'Staff One');
  assert r = c, 'acceptance answers the company';
  assert (select role || ':' || granted_permissions[1] from public.memberships where user_id = u and company_id = c) = 'staff:invoice.read', 'membership with the invited permissions';
  assert (select full_name from public.profiles where user_id = u) = 'Staff One', 'profile created with the membership';
  assert (select count(*) from public.kd_invitation_peek(h1)) = 0, 'a used invitation shows nothing';
  begin perform public.kd_invitation_accept(h1, u, 'Staff One'); assert false, 'a token works once';
  exception when sqlstate '22023' then null; end;
  insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by) values (c, 'late@example.com', h2, now() - interval '1 minute', boss);
  begin perform public.kd_invitation_accept(h2, gen_random_uuid(), 'X'); assert false, 'expired token refused';
  exception when sqlstate '22023' then null; end;
  insert into public.team_invitations (company_id, email, token_hash, expires_at, invited_by, status) values (c, 'gone@example.com', h3, now() + interval '7 days', boss, 'cancelled');
  begin perform public.kd_invitation_accept(h3, gen_random_uuid(), 'X'); assert false, 'cancelled token refused';
  exception when sqlstate '22023' then null; end;
  assert not has_table_privilege('authenticated', 'public.team_invitations', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_invitation_accept(text, uuid, text)', 'execute'), 'service role only';
end
$$;
