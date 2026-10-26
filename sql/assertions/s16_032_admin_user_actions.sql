-- path: sql/assertions/s16_032_admin_user_actions.sql
-- New admin actions are accepted and unknown ones refused; one scheduled deletion per person; a purge needs a scheduled
-- deletion whose grace is over and leaves a tombstone but the row.
do $$
declare
  u uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  cert text;
begin
  insert into auth.users (id, email) values (s, 'del-' || s || '@example.test');
  insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by, params)
    values ('user.change_email', 'user', s, 'Customer lost access to the old mailbox', u, '{"email":"new@example.test"}');
  begin insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('user.delete_now', 'user', gen_random_uuid(), 'Remove everything now please', u); assert false, 'unknown action';
  exception when check_violation then null; end;
  begin perform public.kd_user_purge(s, u); assert false, 'purge needs a scheduled deletion';
  exception when sqlstate '02000' then null; end;
  if not exists (select 1 from public.profiles where user_id = s) then
    insert into public.profiles (user_id, email, full_name) values (s, 'del-' || s || '@example.test', 'Del Person');
  end if;
  update public.profiles set full_name = 'Del Person' where user_id = s;
  insert into public.user_deletions (user_id, requested_by, reason, scheduled_for) values (s, u, 'Asked to close the account', now() + interval '30 days');
  begin insert into public.user_deletions (user_id, requested_by, reason, scheduled_for) values (s, u, 'Second request for the same one', now() + interval '30 days'); assert false, 'one scheduled deletion per person';
  exception when unique_violation then null; end;
  begin perform public.kd_user_purge(s, u); assert false, 'grace period is respected';
  exception when sqlstate '22023' then null; end;
  update public.user_deletions set scheduled_for = now() - interval '1 day' where user_id = s;
  cert := public.kd_user_purge(s, u);
  assert char_length(cert) = 64, 'certificate';
  assert (select full_name from public.profiles where user_id = s) = '', 'name erased';
  assert (select email from public.profiles where user_id = s) like 'erased+%', 'email erased';
  assert exists (select 1 from public.profiles where user_id = s), 'the row stays';
  assert not has_table_privilege('authenticated', 'public.user_deletions', 'select'), 'closed to clients';
end $$;
