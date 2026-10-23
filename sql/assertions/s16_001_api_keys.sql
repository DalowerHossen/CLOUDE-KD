-- path: sql/assertions/s16_001_api_keys.sql
-- API key tables: RLS on; one key per hash; scopes needed; a sandbox key has the test prefix; the identity of a key does not
-- change and a revoked key stays revoked; a replaced key belongs to the same company; the minute and day counters count.
do $$
declare
  c uuid; d uuid; k uuid; k2 uuid; n integer; h text := repeat('a', 64); w timestamptz := date_trunc('minute', now());
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('api_keys', 'api_key_windows', 'api_key_usage', 'api_sandbox_records') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Api Co', 'api-co') returning id into c;
  insert into public.companies (name, slug) values ('Api Other', 'api-other') returning id into d;

  insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes)
    values (c, 'Main', 'kd_live_abcdef', h, 'wxyz', array['read:invoices']) returning id into k;
  begin insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes)
    values (c, 'Copy', 'kd_live_abcdef', h, 'wxyz', array['read:invoices']); assert false, 'one key per hash';
  exception when unique_violation then null; end;
  begin insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes)
    values (c, 'No scope', 'kd_live_abcdef', repeat('b', 64), 'wxyz', array[]::text[]); assert false, 'a key needs a scope';
  exception when check_violation then null; end;
  begin insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes, mode)
    values (c, 'Wrong mode', 'kd_live_abcdef', repeat('c', 64), 'wxyz', array['read:invoices'], 'sandbox'); assert false, 'sandbox needs the test prefix';
  exception when check_violation then null; end;
  begin insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes, rate_limit_per_minute)
    values (c, 'Fast', 'kd_live_abcdef', repeat('d', 64), 'wxyz', array['read:invoices'], 10001); assert false, 'limit bound';
  exception when check_violation then null; end;
  insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes, mode)
    values (c, 'Test', 'kd_test_abcdef', repeat('e', 64), 'wxyz', array['read:invoices'], 'sandbox');

  begin update public.api_keys set key_hash = repeat('f', 64) where id = k; assert false, 'hash does not change';
  exception when object_not_in_prerequisite_state then null; end;
  update public.api_keys set name = 'Renamed', scopes = array['read:invoices', 'read:clients'] where id = k;

  insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes, rotated_from)
    values (c, 'Main', 'kd_live_ghijkl', repeat('1', 64), 'abcd', array['read:invoices'], k) returning id into k2;
  begin insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, scopes, rotated_from)
    values (d, 'Other', 'kd_live_mnopqr', repeat('2', 64), 'abcd', array['read:invoices'], k); assert false, 'replaced key of another company';
  exception when no_data_found then null; end;

  update public.api_keys set revoked_at = now() where id = k;
  begin update public.api_keys set revoked_at = null where id = k; assert false, 'revoked stays revoked';
  exception when object_not_in_prerequisite_state then null; end;

  assert public.kd_api_key_hit(k2, c, w) = 1, 'first hit';
  assert public.kd_api_key_hit(k2, c, w) = 2, 'second hit';
  assert public.kd_api_key_hit(k2, c, w + interval '1 minute') = 1, 'new minute starts again';
  assert public.kd_api_key_usage_add(k2, c, current_date, false) = 1, 'first request of the day';
  assert public.kd_api_key_usage_add(k2, c, current_date, true) = 2, 'second request of the day';
  select errors into n from public.api_key_usage where key_id = k2 and day = current_date;
  assert n = 1, 'one error counted';

  insert into public.api_sandbox_records (company_id, resource, doc) values (c, 'clients', '{"name":"Demo"}');
  begin insert into public.api_sandbox_records (company_id, resource, doc) values (c, 'users', '{}'); assert false, 'resource list';
  exception when check_violation then null; end;
  begin insert into public.api_sandbox_records (company_id, resource, doc) values (c, 'clients', '[]'); assert false, 'doc is an object';
  exception when check_violation then null; end;
end
$$;
