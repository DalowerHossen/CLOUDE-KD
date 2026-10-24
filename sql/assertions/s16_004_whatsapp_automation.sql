-- path: sql/assertions/s16_004_whatsapp_automation.sql
-- WhatsApp automation tables: RLS on; a rule needs the fields of its trigger and a template of its own company; one run per rule
-- and source; a campaign only moves forward and is fixed once it started; a person is in a campaign once; a sent item stays
-- sent; the daily count of people counts each person once and not failed messages.
do $$
declare
  c uuid; d uuid; a uuid; tpl uuid; tpl_o uuid; ad uuid; r uuid; camp uuid; item uuid; ct uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('whatsapp_rules', 'whatsapp_rule_runs', 'whatsapp_campaigns', 'whatsapp_campaign_items') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Wa Auto', 'wa-auto') returning id into c;
  insert into public.companies (name, slug) values ('Wa Auto Other', 'wa-auto-other') returning id into d;
  insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (c, '102290129340398', '106540352242922', enc, 'abcd', enc, repeat('a', 32), repeat('b', 64)) returning id into a;
  insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (d, '102290129340399', '106540352242923', enc, 'abcd', enc, repeat('c', 32), repeat('b', 64)) returning id into ad;
  insert into public.whatsapp_templates (company_id, account_id, name, language, category, components, status) values (c, a, 'reminder', 'en_US', 'utility', '[]', 'APPROVED') returning id into tpl;
  insert into public.whatsapp_templates (company_id, account_id, name, language, category, components, status) values (d, ad, 'reminder', 'en_US', 'utility', '[]', 'APPROVED') returning id into tpl_o;
  select daily_limit into n from public.whatsapp_accounts where id = a;
  assert n = 250, 'the daily limit starts at 250';
  begin update public.whatsapp_accounts set daily_limit = 0 where id = a; assert false, 'limit bounds';
  exception when check_violation then null; end;

  -- rules
  insert into public.whatsapp_rules (company_id, name, trigger_kind, event_name, template_id) values (c, 'Thank you', 'event', 'payment.captured', tpl) returning id into r;
  insert into public.whatsapp_rules (company_id, name, trigger_kind, days_before, template_id) values (c, 'Due soon', 'due_soon', 3, tpl);
  begin insert into public.whatsapp_rules (company_id, name, trigger_kind, template_id) values (c, 'No event', 'event', tpl); assert false, 'event rule needs an event';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_rules (company_id, name, trigger_kind, event_name, days_before, template_id) values (c, 'Both', 'event', 'invoice.paid', 2, tpl); assert false, 'event rule has no days';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_rules (company_id, name, trigger_kind, days_before, template_id) values (c, 'Late', 'due_soon', 61, tpl); assert false, 'days bound';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_rules (company_id, name, trigger_kind, event_name, template_id) values (c, 'Foreign', 'event', 'invoice.paid', tpl_o); assert false, 'template of another company';
  exception when no_data_found then null; end;
  select dry_run into n from (select case when dry_run then 1 else 0 end as dry_run from public.whatsapp_rules where id = r) x;
  assert n = 1, 'a rule starts as a dry run';

  -- runs: once per source
  insert into public.whatsapp_rule_runs (company_id, rule_id, source_key, payload) values (c, r, 'evt-1', '{"invoiceId":"x"}');
  begin insert into public.whatsapp_rule_runs (company_id, rule_id, source_key) values (c, r, 'evt-1'); assert false, 'one run per source';
  exception when unique_violation then null; end;
  begin insert into public.whatsapp_rule_runs (company_id, rule_id, source_key) values (d, r, 'evt-2'); assert false, 'rule of another company';
  exception when no_data_found then null; end;
  begin insert into public.whatsapp_rule_runs (company_id, rule_id, source_key, status) values (c, r, 'evt-3', 'done'); assert false, 'status list';
  exception when check_violation then null; end;

  -- campaigns
  insert into public.whatsapp_campaigns (company_id, name, template_id, segment) values (c, 'June reminder', tpl, '{"tags":["vip"]}') returning id into camp;
  begin insert into public.whatsapp_campaigns (company_id, name, template_id) values (c, 'Foreign', tpl_o); assert false, 'template of another company';
  exception when no_data_found then null; end;
  begin update public.whatsapp_campaigns set status = 'scheduled' where id = camp; assert false, 'scheduled needs its time';
  exception when check_violation then null; end;
  begin update public.whatsapp_campaigns set status = 'done', finished_at = now() where id = camp; assert false, 'draft cannot be done';
  exception when object_not_in_prerequisite_state then null; end;
  update public.whatsapp_campaigns set segment = '{"tags":["gold"]}' where id = camp;
  update public.whatsapp_campaigns set status = 'running', started_at = now() where id = camp;
  begin update public.whatsapp_campaigns set segment = '{}' where id = camp; assert false, 'segment fixed after start';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.whatsapp_campaigns set status = 'draft' where id = camp; assert false, 'no way back';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.whatsapp_campaign_items (company_id, campaign_id, phone_e164, name) values (c, camp, '+16505551234', 'Ann') returning id into item;
  begin insert into public.whatsapp_campaign_items (company_id, campaign_id, phone_e164) values (c, camp, '+16505551234'); assert false, 'a person once';
  exception when unique_violation then null; end;
  begin insert into public.whatsapp_campaign_items (company_id, campaign_id, phone_e164) values (d, camp, '+16505551299'); assert false, 'campaign of another company';
  exception when no_data_found then null; end;
  update public.whatsapp_campaign_items set status = 'sent' where id = item;
  begin update public.whatsapp_campaign_items set status = 'pending' where id = item; assert false, 'sent stays sent';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.whatsapp_campaign_items set phone_e164 = '+16505550000' where id = item; assert false, 'number fixed';
  exception when object_not_in_prerequisite_state then null; end;

  update public.whatsapp_campaigns set status = 'done', finished_at = now() where id = camp;
  begin update public.whatsapp_campaigns set name = 'x' where id = camp; assert false, 'finished campaign';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.whatsapp_campaigns set status = 'done' where id = camp; assert false, 'done is final';
  exception when object_not_in_prerequisite_state or check_violation then null; end;

  -- the daily count: each person once, failed messages not counted, text messages not counted
  insert into public.whatsapp_contacts (company_id, phone_e164, opt_status, opt_changed_at) values (c, '+16505551240', 'opted_in', now()) returning id into ct;
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, type, template_id, body, status) values (c, a, ct, 'out', 'template', tpl, 'a', 'sent');
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, type, template_id, body, status) values (c, a, ct, 'out', 'template', tpl, 'b', 'delivered');
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct, 'out', 'text', 'queued');
  assert public.kd_whatsapp_template_recipients_24h(c) = 1, 'one person counted once';
  insert into public.whatsapp_contacts (company_id, phone_e164, opt_status, opt_changed_at) values (c, '+16505551241', 'opted_in', now()) returning id into ct;
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, type, template_id, body, status) values (c, a, ct, 'out', 'template', tpl, 'c', 'failed');
  assert public.kd_whatsapp_template_recipients_24h(c) = 1, 'failed not counted';
  assert public.kd_whatsapp_template_recipients_24h(d) = 0, 'other company';
end
$$;
