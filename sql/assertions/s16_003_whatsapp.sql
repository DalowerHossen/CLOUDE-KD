-- path: sql/assertions/s16_003_whatsapp.sql
-- WhatsApp tables: RLS on; one account per company and one webhook key; template names and categories checked; the opt-in rules
-- (nothing to someone who opted out, nothing to someone who neither opted in nor wrote in the last 24 hours); a decision about
-- messages cannot be removed; a message keeps its text and its status does not go back; a wamid and an idempotency key are used once.
do $$
declare
  c uuid; d uuid; a uuid; ad uuid; ct_in uuid; ct_out uuid; ct_new uuid; ct_win uuid; tpl uuid; m uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('whatsapp_accounts', 'whatsapp_templates', 'whatsapp_contacts', 'whatsapp_messages') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Wa Co', 'wa-co') returning id into c;
  insert into public.companies (name, slug) values ('Wa Other', 'wa-other') returning id into d;
  insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (c, '102290129340398', '106540352242922', enc, 'abcd', enc, repeat('a', 32), repeat('b', 64)) returning id into a;
  insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (d, '102290129340399', '106540352242923', enc, 'abcd', enc, repeat('c', 32), repeat('b', 64)) returning id into ad;
  begin insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (c, '102290129340398', '106540352242922', enc, 'abcd', enc, repeat('e', 32), repeat('b', 64)); assert false, 'one account per company';
  exception when unique_violation then null; end;
  begin insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (d, '102290129340399', '106540352242923', enc, 'abcd', enc, repeat('a', 32), repeat('b', 64)); assert false, 'one webhook key';
  exception when unique_violation then null; end;
  begin insert into public.whatsapp_accounts (company_id, waba_id, phone_number_id, access_token_enc, access_token_last4, app_secret_enc, webhook_key, verify_token_hash)
    values (d, 'abc', '106540352242923', enc, 'abcd', enc, repeat('f', 32), repeat('b', 64)); assert false, 'waba id digits';
  exception when check_violation or unique_violation then null; end;

  insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'order_confirmation', 'en_US', 'utility', '[]') returning id into tpl;
  begin insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'Order Confirmation', 'en_US', 'utility', '[]'); assert false, 'lower case names';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'order_confirmation', 'en_US', 'utility', '[]'); assert false, 'one template per name and language';
  exception when unique_violation then null; end;
  insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'order_confirmation', 'de', 'utility', '[]');
  begin insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, a, 'x', 'en_US', 'sales', '[]'); assert false, 'category list';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_templates (company_id, account_id, name, language, category, components) values (c, ad, 'x', 'en_US', 'utility', '[]'); assert false, 'account of another company';
  exception when no_data_found then null; end;
  begin update public.whatsapp_templates set name = 'renamed' where id = tpl; assert false, 'name does not change';
  exception when object_not_in_prerequisite_state then null; end;
  update public.whatsapp_templates set status = 'APPROVED' where id = tpl;

  insert into public.whatsapp_contacts (company_id, phone_e164, opt_status, opt_changed_at) values (c, '+16505551234', 'opted_in', now()) returning id into ct_in;
  insert into public.whatsapp_contacts (company_id, phone_e164, opt_status, opt_changed_at) values (c, '+16505551235', 'opted_out', now()) returning id into ct_out;
  insert into public.whatsapp_contacts (company_id, phone_e164) values (c, '+16505551236') returning id into ct_new;
  insert into public.whatsapp_contacts (company_id, phone_e164, last_inbound_at) values (c, '+16505551237', now() - interval '2 hours') returning id into ct_win;
  begin insert into public.whatsapp_contacts (company_id, phone_e164) values (c, '+16505551234'); assert false, 'one contact per number';
  exception when unique_violation then null; end;
  begin insert into public.whatsapp_contacts (company_id, phone_e164) values (c, '16505551238'); assert false, 'E.164 with plus';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_contacts (company_id, phone_e164, opt_status) values (c, '+16505551239', 'opted_in'); assert false, 'a decision needs its time';
  exception when check_violation then null; end;
  begin update public.whatsapp_contacts set phone_e164 = '+16505550000' where id = ct_in; assert false, 'number does not change';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.whatsapp_contacts set opt_status = 'unknown', opt_changed_at = null where id = ct_out; assert false, 'decision stays';
  exception when object_not_in_prerequisite_state then null; end;

  -- sending rules
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct_in, 'out', 'hello', 'queued') returning id into m;
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct_out, 'out', 'hello', 'queued'); assert false, 'opted out';
  exception when insufficient_privilege then null; end;
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct_new, 'out', 'hello', 'queued'); assert false, 'no opt in and no recent message';
  exception when insufficient_privilege then null; end;
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status, origin) values (c, a, ct_win, 'out', 'reply', 'queued', 'reply');
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct_out, 'in', 'STOP', 'received');
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, ad, ct_in, 'out', 'x', 'queued'); assert false, 'account of another company';
  exception when no_data_found then null; end;
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, type, body, status) values (c, a, ct_in, 'out', 'template', '', 'queued'); assert false, 'template message needs a template';
  exception when check_violation then null; end;
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status) values (c, a, ct_in, 'in', 'x', 'queued'); assert false, 'direction and status agree';
  exception when check_violation then null; end;

  -- status and identifiers
  update public.whatsapp_messages set wa_message_id = 'wamid.A', status = 'sent', sent_at = now() where id = m;
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status, wa_message_id) values (c, a, ct_in, 'out', 'again', 'sent', 'wamid.A'); assert false, 'one wamid';
  exception when unique_violation then null; end;
  begin update public.whatsapp_messages set body = 'changed' where id = m; assert false, 'text fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.whatsapp_messages set status = 'delivered', delivered_at = now() where id = m;
  begin update public.whatsapp_messages set status = 'sent' where id = m; assert false, 'status does not go back';
  exception when object_not_in_prerequisite_state then null; end;
  update public.whatsapp_messages set status = 'read', read_at = now() where id = m;
  begin update public.whatsapp_messages set status = 'failed' where id = m; assert false, 'finished message';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status, idempotency_key) values (c, a, ct_in, 'out', 'k', 'queued', 'idem-key-0001');
  begin insert into public.whatsapp_messages (company_id, account_id, contact_id, direction, body, status, idempotency_key) values (c, a, ct_in, 'out', 'k', 'queued', 'idem-key-0001'); assert false, 'idempotency key once';
  exception when unique_violation then null; end;
end
$$;
