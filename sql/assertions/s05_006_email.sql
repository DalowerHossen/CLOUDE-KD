-- path: sql/assertions/s05_006_email.sql
-- Outbox: idempotency key, one-minute duplicate guard, suppression, claim and retry, delivery feedback, tracking,
-- settings slots, append-only events.
do $$
declare
  c uuid := public.uuid_generate_v7(); c2 uuid := public.uuid_generate_v7(); r jsonb; id1 uuid; n int; row public.email_outbox%rowtype;
  d1 text := repeat('a', 64); d2 text := repeat('b', 64);
begin
  insert into public.companies (id, name, slug) values (c, 'E1', 'mail-a');
  r := public.kd_email_enqueue(c, 'key-00000001', d1, 'auth.verify-email', 'Jane@Example.com', 'Hi', '<p>x</p>', 'x', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'queued', 'queued'; id1 := (r->>'id')::uuid;
  assert (select to_email from public.email_outbox where id = id1) = 'jane@example.com', 'address is lower case';
  r := public.kd_email_enqueue(c, 'key-00000001', d2, 'auth.verify-email', 'jane@example.com', 'Hi', '<p>x</p>', 'x', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'exists' and (r->>'id')::uuid = id1, 'same idempotency key';
  r := public.kd_email_enqueue(c, 'key-00000002', d1, 'auth.verify-email', 'jane@example.com', 'Hi', '<p>x</p>', 'x', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'duplicate', 'same content inside one minute';
  update public.email_outbox set created_at = now() - interval '2 minutes' where id = id1;
  r := public.kd_email_enqueue(c, 'key-00000003', d1, 'auth.verify-email', 'jane@example.com', 'Hi', '<p>x</p>', 'x', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'queued', 'allowed again after a minute';

  select count(*) into n from public.kd_email_claim(10);
  assert n = 2, 'claim hands out due messages';
  select count(*) into n from public.kd_email_claim(10);
  assert n = 0, 'claimed messages are not handed out again';
  perform public.kd_email_result(id1, 'retry', 'smtp', null, 'timeout', now() - interval '1 second');
  assert (select status from public.email_outbox where id = id1) = 'queued', 'retry goes back to the queue';
  select count(*) into n from public.kd_email_claim(10, id1);
  assert n = 1, 'claim of one message';
  perform public.kd_email_result(id1, 'defer', null, null, 'daily limit', now() - interval '1 second');
  assert (select attempts from public.email_outbox where id = id1) = 1, 'a deferral keeps the attempt count';
  select count(*) into n from public.kd_email_claim(10, id1);
  perform public.kd_email_result(id1, 'sent', 'resend', 'msg-1', null, null);
  select * into row from public.email_outbox where id = id1;
  assert row.status = 'sent' and row.provider = 'resend' and row.delivery_status = 'sent' and row.sent_at is not null, 'sent';
  begin perform public.kd_email_result(id1, 'weird', null, null, null, null); assert false, 'status checked';
  exception when invalid_parameter_value then null; end;

  assert (public.kd_email_event('msg-1', 'delivered')->>'found')::boolean, 'event found';
  assert (select delivery_status from public.email_outbox where id = id1) = 'delivered', 'delivered';
  perform public.kd_email_event('msg-1', 'opened');
  perform public.kd_email_event('msg-1', 'delivered');
  assert (select delivery_status from public.email_outbox where id = id1) = 'opened', 'status never moves backwards';
  assert not (public.kd_email_event('unknown', 'delivered')->>'found')::boolean, 'unknown message';
  perform public.kd_email_event('msg-1', 'bounce_hard');
  assert (select delivery_status from public.email_outbox where id = id1) = 'bounced', 'bounce wins';
  assert exists (select 1 from public.email_suppressions where company_id = c and email = 'jane@example.com' and reason = 'hard_bounce'), 'hard bounce suppresses';
  r := public.kd_email_enqueue(c, 'key-00000004', d2, 'invoice.sent', 'JANE@example.com', 'Hi', '<p>y</p>', 'y', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'suppressed', 'suppressed address is not queued';
  assert (select status from public.email_outbox where id = (r->>'id')::uuid) = 'suppressed', 'logged as suppressed';
  insert into public.companies (id, name, slug) values (c2, 'E2', 'mail-b');
  r := public.kd_email_enqueue(c2, 'key-00000005', repeat('c', 64), 'invoice.sent', 'jane@example.com', 'Hi', '', '', '[]'::jsonb, false, null, now());
  assert r->>'state' = 'queued', 'another company has its own suppression list';

  r := public.kd_email_enqueue(c, 'key-00000006', repeat('d', 64), 'invoice.sent', 'tracked@example.com', 'T', '<p>t</p>', 't', '[]'::jsonb, true, 'tok-123456', now());
  assert public.kd_email_track('tok-123456', 'opened'), 'open tracked';
  assert not public.kd_email_track('missing', 'opened'), 'unknown token';
  assert (select delivery_status from public.email_outbox where tracking_token = 'tok-123456') = 'opened', 'opened by pixel';
  assert public.kd_email_track('tok-123456', 'clicked'), 'click tracked';
  assert (select delivery_status from public.email_outbox where tracking_token = 'tok-123456') = 'clicked', 'clicked';
  r := public.kd_email_enqueue(c, 'key-00000007', repeat('e', 64), 'auth.verify-email', 'plain@example.com', 'T', '<p>t</p>', 't', '[]'::jsonb, false, 'tok-notrack', now());
  assert not public.kd_email_track('tok-notrack', 'opened'), 'untracked mail ignores the pixel';

  begin update public.email_events set kind = 'opened' where outbox_id = id1; assert false, 'events are append-only';
  exception when assert_failure then raise; when others then null; end;

  insert into public.email_settings (company_id, priority, provider, from_email) values (null, 1, 'smtp', 'noreply@example.com');
  begin insert into public.email_settings (company_id, priority, provider, from_email) values (null, 1, 'resend', 'noreply@example.com'); assert false, 'one setting per slot';
  exception when unique_violation then null; end;
  insert into public.email_settings (company_id, priority, provider, from_email) values (null, 2, 'resend', 'noreply@example.com');
  insert into public.email_settings (company_id, priority, provider, from_email) values (c, 1, 'smtp', 'billing@example.com');
  begin insert into public.email_settings (company_id, priority, provider, from_email) values (c, 4, 'smtp', 'billing@example.com'); assert false, 'priority limited to 3';
  exception when check_violation then null; end;
  insert into public.email_settings (company_id, priority, provider, from_email, from_name) values (c, 3, 'platform', null, 'Acme Billing');
  begin insert into public.email_settings (company_id, priority, provider, from_email) values (null, 3, 'platform', null); assert false, 'platform rows belong to a company';
  exception when check_violation then null; end;
  begin insert into public.email_settings (company_id, priority, provider, from_email) values (c, 2, 'smtp', null); assert false, 'own provider needs a from address';
  exception when check_violation then null; end;
  begin insert into public.email_settings (company_id, priority, provider, from_email) values (c, 2, 'carrier-pigeon', 'billing@example.com'); assert false, 'provider checked';
  exception when check_violation then null; end;
  assert public.kd_email_unsubscribe('tok-notrack'), 'unsubscribe by token';
  assert exists (select 1 from public.email_suppressions where email = 'plain@example.com' and reason = 'unsubscribe'), 'unsubscribed address is suppressed';
  assert not public.kd_email_unsubscribe('nope'), 'unknown unsubscribe token';
  assert public.kd_email_sent_count(c, now() - interval '1 day') >= 1, 'sent count';
  perform public.kd_email_result((select id from public.email_outbox where idempotency_key = 'key-00000006'), 'sent', 'smtp', 'msg-9', null, null, (select id from public.email_settings where company_id = c and priority = 1));
  assert public.kd_email_setting_count((select id from public.email_settings where company_id = c and priority = 1), now() - interval '1 day') = 1, 'count by setting';
  assert not has_function_privilege('authenticated', 'public.kd_email_claim(integer, uuid)', 'execute'), 'service role only';
  assert not has_table_privilege('authenticated', 'public.email_outbox', 'select'), 'outbox closed to clients';
end
$$;
