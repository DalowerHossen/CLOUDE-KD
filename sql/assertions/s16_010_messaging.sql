-- path: sql/assertions/s16_010_messaging.sql
-- Messaging tables: RLS on; channel lists hold only e-mail and WhatsApp, once each; one route per kind and one preference per
-- client; a preferred channel is not a blocked one; a campaign starts as a draft, moves forward only, its test settings and
-- variants are fixed after the start, and its winner is chosen once and is one of its own variants; a variant needs a template
-- for WhatsApp and a subject and text for e-mail; messages belong to the company of the client and campaign, are one per campaign
-- and client, move in the allowed ways only, and a sent message is final; the claim takes due queued messages once.
do $$
declare
  c uuid; d uuid; cl uuid; cld uuid; a uuid; tpl uuid; camp uuid; va uuid; vb uuid; m uuid; n integer; s text;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('messaging_settings', 'messaging_routes', 'messaging_client_prefs', 'messaging_campaigns', 'messaging_variants', 'messaging_messages') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Msg Co', 'msg-co') returning id into c;
  insert into public.companies (name, slug) values ('Msg Other', 'msg-other') returning id into d;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Client One', '1', 'US') returning id into cl;
  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (d, 'Client Other', '1', 'US') returning id into cld;
  insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (c, '102290129340398', '106540352242922', enc, 'abcd', enc, repeat('a', 32), repeat('b', 64)) returning id into a;
  insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'promo_msg', 'en_US', 'marketing', '[]') returning id into tpl;

  -- settings
  insert into public.messaging_settings (company_id, quiet_enabled, quiet_start, quiet_end, timezone, email_cost, whatsapp_cost) values (c, true, '22:00', '08:00', 'Asia/Dhaka', 0.0010, 0.0500);
  begin insert into public.messaging_settings (company_id) values (c); assert false, 'one settings row';
  exception when unique_violation then null; end;
  begin insert into public.messaging_settings (company_id, quiet_start, quiet_end) values (d, '09:00', '09:00'); assert false, 'quiet hours need two different times';
  exception when check_violation then null; end;
  begin insert into public.messaging_settings (company_id, quiet_start) values (d, '25:00'); assert false, 'time of day';
  exception when check_violation then null; end;
  begin insert into public.messaging_settings (company_id, email_cost) values (d, -1); assert false, 'cost not negative';
  exception when check_violation then null; end;

  -- routes
  insert into public.messaging_routes (company_id, kind, channels) values (c, 'invoice.overdue', array['whatsapp', 'email']);
  begin insert into public.messaging_routes (company_id, kind, channels) values (c, 'invoice.overdue', array['email']); assert false, 'one route per kind';
  exception when unique_violation then null; end;
  begin insert into public.messaging_routes (company_id, kind, channels) values (c, 'x.one', array['email', 'email']); assert false, 'channel once';
  exception when check_violation then null; end;
  begin insert into public.messaging_routes (company_id, kind, channels) values (c, 'x.two', array['sms']); assert false, 'e-mail and WhatsApp only';
  exception when check_violation then null; end;
  begin insert into public.messaging_routes (company_id, kind, channels) values (c, 'x.three', array[]::text[]); assert false, 'a channel needed';
  exception when check_violation then null; end;

  -- client preferences
  insert into public.messaging_client_prefs (company_id, client_id, preferred, blocked) values (c, cl, 'whatsapp', array['email']::text[]);
  begin insert into public.messaging_client_prefs (company_id, client_id) values (c, cl); assert false, 'one preference per client';
  exception when unique_violation then null; end;
  begin insert into public.messaging_client_prefs (company_id, client_id, preferred, blocked) values (c, cld, 'email', array[]::text[]); assert false, 'client of another company';
  exception when no_data_found then null; end;
  begin insert into public.messaging_client_prefs (company_id, client_id, preferred, blocked) values (d, cld, 'email', array['email']::text[]); assert false, 'preferred is not blocked';
  exception when check_violation then null; end;

  -- campaign and variants
  insert into public.messaging_campaigns (company_id, name, ab_enabled, test_percent) values (c, 'Spring', true, 20) returning id into camp;
  begin insert into public.messaging_campaigns (company_id, name, status) values (c, 'Started', 'running'); assert false, 'starts as a draft';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.messaging_campaigns (company_id, name, test_percent) values (c, 'Bad', 4); assert false, 'test percent from 5';
  exception when check_violation then null; end;
  insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject, body, whatsapp_template_id)
    values (c, camp, 'A', array['whatsapp', 'email'], 'Spring offer', 'Hello {client.name}', tpl) returning id into va;
  insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject, body)
    values (c, camp, 'B', array['email'], 'Spring offer B', 'Hello again') returning id into vb;
  begin insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject, body) values (c, camp, 'B', array['email'], 'x', 'y'); assert false, 'one variant per label';
  exception when unique_violation then null; end;
  begin insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject, body) values (c, camp, 'E', array['email'], 'x', 'y'); assert false, 'labels A to D';
  exception when check_violation then null; end;
  begin insert into public.messaging_variants (company_id, campaign_id, label, channel_order) values (c, camp, 'C', array['whatsapp']); assert false, 'WhatsApp needs a template';
  exception when check_violation then null; end;
  begin insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject) values (c, camp, 'C', array['email'], 'only a subject'); assert false, 'e-mail needs text';
  exception when check_violation then null; end;
  begin insert into public.messaging_variants (company_id, campaign_id, label, channel_order, subject, body) values (d, camp, 'C', array['email'], 'x', 'y'); assert false, 'variant of another company';
  exception when no_data_found then null; end;

  -- messages
  insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, campaign_id, variant_id, channel_order, subject, body, status)
    values (c, 'camp-1-client-1', 'campaign', cl, camp, va, array['whatsapp', 'email'], 'Spring offer', 'Hello', 'held') returning id into m;
  begin insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, channel_order) values (c, 'camp-1-client-1', 'notice', cl, array['email']); assert false, 'idempotency key once';
  exception when unique_violation then null; end;
  begin insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, campaign_id, variant_id, channel_order) values (c, 'camp-1-client-2', 'campaign', cl, camp, vb, array['email']); assert false, 'a client once per campaign';
  exception when unique_violation then null; end;
  begin insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, channel_order) values (c, 'notice-other', 'notice', cld, array['email']); assert false, 'client of another company';
  exception when no_data_found then null; end;
  begin insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, channel_order) values (c, 'notice-campaign', 'campaign', cl, array['email']); assert false, 'a campaign message needs its campaign and variant';
  exception when check_violation then null; end;
  begin insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, channel_order, status) values (c, 'notice-sent', 'notice', cl, array['email'], 'sent'); assert false, 'starts queued or held';
  exception when object_not_in_prerequisite_state or check_violation then null; end;
  begin update public.messaging_messages set status = 'sent', channel = 'email' where id = m; assert false, 'held cannot jump to sent';
  exception when object_not_in_prerequisite_state then null; end;

  -- a campaign starts: variants and test settings are fixed, the winner is chosen once
  update public.messaging_campaigns set status = 'testing', started_at = now() where id = camp;
  begin update public.messaging_campaigns set test_percent = 30 where id = camp; assert false, 'test fixed after start';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.messaging_variants set body = 'changed' where id = vb; assert false, 'variants fixed after start';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.messaging_campaigns set status = 'draft' where id = camp; assert false, 'no way back to draft';
  exception when object_not_in_prerequisite_state then null; end;
  update public.messaging_campaigns set winner_variant_id = va, winner_chosen_at = now(), winner_reason = 'A engaged more', status = 'running' where id = camp;
  begin update public.messaging_campaigns set winner_variant_id = vb where id = camp; assert false, 'winner chosen once';
  exception when object_not_in_prerequisite_state then null; end;

  -- a message is claimed once, then finished
  update public.messaging_messages set status = 'queued' where id = m;
  select count(*) into n from public.kd_claim_messages(10);
  assert n = 1, 'the queued message is claimed';
  select status into s from public.messaging_messages where id = m;
  assert s = 'sending', 'claimed message is sending';
  select count(*) into n from public.kd_claim_messages(10);
  assert n = 0, 'a claimed message is not claimed again';
  begin update public.messaging_messages set status = 'sent' where id = m; assert false, 'sent needs its channel';
  exception when check_violation then null; end;
  update public.messaging_messages set status = 'sent', channel = 'email', sent_at = now(), cost = 0.0010 where id = m;
  begin update public.messaging_messages set status = 'queued' where id = m; assert false, 'sent is final';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.messaging_messages (company_id, idempotency_key, kind, client_id, channel_order, send_after) values (c, 'notice-later', 'notice', cl, array['email'], now() + interval '2 hours');
  select count(*) into n from public.kd_claim_messages(10);
  assert n = 0, 'a message for later is not claimed';
end
$$;
