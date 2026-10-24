-- path: sql/assertions/s05_008_notifications.sql
-- Notifications: insert, dedupe, hourly throttle, mark read (own rows only), preference uniqueness, purge, own-row policy.
do $$
declare
  c uuid := public.uuid_generate_v7(); u1 uuid := public.uuid_generate_v7(); u2 uuid := public.uuid_generate_v7();
  id1 uuid; id2 uuid; n int;
begin
  insert into public.companies (id, name, slug) values (c, 'N1', 'notify-a');
  insert into auth.users (id, email) values (u1, 'n1@example.com'), (u2, 'n2@example.com');

  id1 := public.kd_notify_insert(c, u1, 'invoice', 'invoice.paid', 'Invoice paid', 'Body', '/invoices/1', 'invoice.paid:1', 100);
  assert id1 is not null, 'stored';
  assert public.kd_notify_insert(c, u1, 'invoice', 'invoice.paid', 'Invoice paid', 'Body', '/invoices/1', 'invoice.paid:1', 100) is null, 'same dedupe key inside 24 hours';
  assert public.kd_notify_insert(c, u2, 'invoice', 'invoice.paid', 'Invoice paid', 'Body', null, 'invoice.paid:1', 100) is not null, 'dedupe is per person';
  id2 := public.kd_notify_insert(c, u1, 'system', 'system.maintenance', 'Maintenance', '', null, null, 100);
  assert id2 is not null, 'no dedupe key, no dedupe';
  assert public.kd_notify_insert(c, u1, 'system', 'system.maintenance', 'Maintenance', '', null, null, 2) is null, 'throttle at the hourly limit';
  begin perform public.kd_notify_insert(c, u1, 'weird', 'x.y', 'T', '', null, null, 100); assert false, 'category checked';
  exception when check_violation then null; end;
  begin perform public.kd_notify_insert(c, u1, 'system', 'x.y', 'T', '', '//evil.test/x', null, 100); assert false, 'only internal paths';
  exception when check_violation then null; end;
  begin perform public.kd_notify_insert(c, u1, 'system', 'x.y', 'T', '', 'https://evil.test', null, 100); assert false, 'no absolute address';
  exception when check_violation then null; end;

  assert public.kd_notification_mark_read(u2, array[id1]) = 0, 'cannot mark another person''s notification';
  assert (select read_at from public.notifications where id = id1) is null, 'still unread';
  assert public.kd_notification_mark_read(u1, array[id1]) = 1, 'mark one';
  assert public.kd_notification_mark_read(u1, null) = 1, 'mark all';
  assert public.kd_notification_mark_read(u1, null) = 0, 'nothing left';

  insert into public.notification_preferences (company_id, user_id, category, channel, enabled) values (c, u1, 'invoice', 'email', true);
  begin insert into public.notification_preferences (company_id, user_id, category, channel, enabled) values (c, u1, 'invoice', 'email', false); assert false, 'one preference per category and channel';
  exception when unique_violation then null; end;
  begin insert into public.notification_preferences (company_id, user_id, category, channel, enabled) values (c, u1, 'invoice', 'sms', true); assert false, 'channel checked';
  exception when check_violation then null; end;

  update public.notifications set created_at = now() - interval '200 days' where id = id1;
  assert public.kd_notification_purge() >= 1, 'old read notifications are removed';
  assert has_column_privilege('authenticated', 'public.notifications', 'title', 'select'), 'own rows can be read by the browser';
  assert not has_column_privilege('authenticated', 'public.notifications', 'dedupe_key', 'select'), 'internal columns are not readable';
  assert not has_table_privilege('authenticated', 'public.notifications', 'update'), 'writes are server only';
  assert not has_table_privilege('authenticated', 'public.notification_preferences', 'select'), 'preferences closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_notify_insert(uuid, uuid, text, text, text, text, text, text, integer)', 'execute'), 'service role only';
  assert exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'notifications_own'), 'own-row policy';
end
$$;
