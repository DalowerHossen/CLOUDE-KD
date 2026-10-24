-- path: sql/assertions/s02_007_compliance.sql
-- Erasure keeps the audit chain valid, retention applies, access rules.
do $$
declare
  c uuid := public.uuid_generate_v7();
  u uuid := public.uuid_generate_v7();
  rid uuid; cert text; cert2 text; res jsonb; n int;
begin
  insert into auth.users (id, email) values (u, 'person@example.com');
  insert into public.companies (id, name, slug) values (c, 'Dsar', 'dsar-co');
  insert into public.profiles (company_id, user_id, email, full_name) values (c, u, 'person@example.com', 'Real Name');
  perform public.kd_audit_append(c, u, 'owner', null, 'profile.viewed', 'profile', u, null, null, null, null, '{}');
  res := public.kd_audit_verify(c::text);
  assert (res ->> 'ok')::boolean, 'chain valid before erasure';

  insert into public.dsar_requests (company_id, request_type, subject_user_id, subject_hash, due_at)
  values (c, 'erase', u, repeat('a', 64), now() + interval '30 days') returning id into rid;
  cert := public.kd_dsar_erase_profile(rid, null);
  assert char_length(cert) = 64, 'certificate of deletion';
  assert (select full_name from public.profiles where user_id = u) = '', 'name erased';
  assert (select email from public.profiles where user_id = u) like 'erased+%', 'email tombstone';
  cert2 := public.kd_dsar_erase_profile(rid, null);
  assert cert = cert2, 'erasure is idempotent';
  res := public.kd_audit_verify(c::text);
  assert (res ->> 'ok')::boolean, 'chain still valid after erasure: ' || res::text;
  select count(*) into n from public.audit_logs where company_id = c and (metadata::text like '%Real Name%' or metadata::text like '%person@example.com%');
  assert n = 0, 'audit never held personal data';

  -- retention
  perform public.kd_publish_event(null, 'invoice.created', '{}');
  update public.domain_events set status = 'done', processed_at = now() - interval '31 days';
  res := public.kd_apply_retention_core();
  assert (res ->> 'domain_events')::int >= 1, 'old events removed by retention';

  -- seeds present
  select count(*) into n from public.retention_policies where company_id is null; assert n >= 4, 'retention seeds';
  select count(*) into n from public.data_classifications where company_id is null; assert n >= 9, 'classification seeds';

  -- access
  insert into public.consent_records_platform (company_id, subject_hash, purpose, policy_version, text_hash)
  values (c, repeat('b', 64), 'marketing', 'v1', repeat('c', 64));
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'app_metadata', json_build_object('company_id', public.uuid_generate_v7(), 'role', 'owner'))::text, true);
  set local role authenticated;
  select count(*) into n from public.consent_records_platform; assert n = 0, 'other tenant sees no consent';
  select count(*) into n from public.dsar_requests; assert n = 0, 'other tenant sees no dsar';
  begin insert into public.retention_policies (data_type, retention_days) values ('x', 1); assert false, 'owner cannot write retention';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_dsar_erase_profile(rid, null); assert false, 'erase function closed';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
