-- path: sql/assertions/s16_002_webhooks_out.sql
-- Outgoing webhook tables: RLS on; https addresses only; one automatic delivery per event and endpoint (a manual test or replay
-- may repeat); a delivery of another company's endpoint refused; a delivery keeps its event and payload; a finished delivery does
-- not change; attempts are append only; the claim function takes due deliveries once and skips locked, future, paused and
-- finished ones.
do $$
declare
  c uuid; d uuid; e uuid; e2 uuid; ed uuid; a uuid; b uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('webhook_endpoints', 'webhook_deliveries', 'webhook_delivery_attempts') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Hook Co', 'hook-co') returning id into c;
  insert into public.companies (name, slug) values ('Hook Other', 'hook-other') returning id into d;

  insert into public.webhook_endpoints (company_id, url, events, secret_enc, secret_last4) values (c, 'https://example.test/hook', array['invoice.paid'], enc, 'abcd') returning id into e;
  insert into public.webhook_endpoints (company_id, url, events, secret_enc, secret_last4) values (c, 'https://example.test/hook2', array['invoice.paid'], enc, 'abcd') returning id into e2;
  insert into public.webhook_endpoints (company_id, url, events, secret_enc, secret_last4) values (d, 'https://other.test/hook', array['invoice.paid'], enc, 'abcd') returning id into ed;
  begin insert into public.webhook_endpoints (company_id, url, events, secret_enc, secret_last4) values (c, 'http://example.test/hook', array['invoice.paid'], enc, 'abcd'); assert false, 'https only';
  exception when check_violation then null; end;
  begin insert into public.webhook_endpoints (company_id, url, events, secret_enc, secret_last4) values (c, 'https://example.test/x', array[]::text[], enc, 'abcd'); assert false, 'events needed';
  exception when check_violation then null; end;
  begin update public.webhook_endpoints set status = 'disabled' where id = e; assert false, 'disabled needs its time';
  exception when check_violation then null; end;
  update public.webhook_endpoints set status = 'disabled', disabled_at = now(), disabled_reason = 'too many failures' where id = e2;
  begin update public.webhook_endpoints set previous_secret_enc = enc where id = e; assert false, 'previous secret needs its expiry';
  exception when check_violation then null; end;

  insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, payload, next_attempt_at) values (c, e, 'ev1', 'invoice.paid', '{"a":1}', now() - interval '1 minute') returning id into a;
  begin insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, payload, next_attempt_at) values (c, e, 'ev1', 'invoice.paid', '{"a":1}', now()); assert false, 'one delivery per event and endpoint';
  exception when unique_violation then null; end;
  insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, kind, payload, next_attempt_at) values (c, e, 'ev1', 'invoice.paid', 'test', '{"a":1}', now() + interval '1 hour');
  insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, kind, replay_of, payload, next_attempt_at) values (c, e, 'ev1', 'invoice.paid', 'replay', a, '{"a":1}', now() + interval '1 hour');
  begin insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, payload, next_attempt_at) values (c, ed, 'ev2', 'invoice.paid', '{}', now()); assert false, 'endpoint of another company';
  exception when no_data_found then null; end;
  begin insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, payload) values (c, e, 'ev3', 'invoice.paid', '{}'); assert false, 'a pending delivery needs its next attempt';
  exception when check_violation then null; end;
  begin update public.webhook_deliveries set payload = '{"a":2}' where id = a; assert false, 'payload fixed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.webhook_deliveries set status = 'succeeded' where id = a; assert false, 'succeeded needs its time';
  exception when check_violation then null; end;

  -- claim: the due delivery of the active endpoint only, once
  insert into public.webhook_deliveries (company_id, endpoint_id, event_id, event_name, payload, next_attempt_at) values (c, e2, 'ev9', 'invoice.paid', '{}', now() - interval '1 minute');
  select count(*) into n from public.kd_claim_webhook_deliveries(10, 60);
  assert n = 1, 'one due delivery of an active endpoint';
  select count(*) into n from public.kd_claim_webhook_deliveries(10, 60);
  assert n = 0, 'a locked delivery is not taken again';

  update public.webhook_deliveries set status = 'succeeded', delivered_at = now(), attempts = 1 where id = a;
  begin update public.webhook_deliveries set status = 'pending', next_attempt_at = now() where id = a; assert false, 'finished delivery';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.webhook_delivery_attempts (company_id, delivery_id, attempt, status_code, ok) values (c, a, 1, 200, true) returning id into b;
  begin insert into public.webhook_delivery_attempts (company_id, delivery_id, attempt, status_code, ok) values (c, a, 1, 200, true); assert false, 'one row per attempt';
  exception when unique_violation then null; end;
  begin insert into public.webhook_delivery_attempts (company_id, delivery_id, attempt, ok) values (d, a, 2, false); assert false, 'attempt of another company';
  exception when no_data_found then null; end;
  begin update public.webhook_delivery_attempts set status_code = 500 where id = b; assert false, 'attempts are append only';
  exception when object_not_in_prerequisite_state then null; end;
end
$$;
