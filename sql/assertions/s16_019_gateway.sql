-- path: sql/assertions/s16_019_gateway.sql
-- Gateway tables: RLS on; one upstream and one route (method and path) per company; a reference is unique per company; path templates
-- cannot hold dot segments or double slashes; a key belongs to a sub-merchant of its own company, its hash is unique and does not change;
-- a closed sub-merchant stays closed; the call log cannot change; the hit counter counts per window.
do $$
declare
  c uuid; d uuid; s uuid; s2 uuid; k uuid; n integer; r uuid;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
  h1 text := repeat('a', 64);
  h2 text := repeat('b', 64);
  w timestamptz := date_trunc('minute', now());
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('gateway_upstreams', 'gateway_routes', 'sub_merchants', 'sub_merchant_keys', 'gateway_calls', 'gateway_key_windows') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Gate Co', 'gate-co') returning id into c;
  insert into public.companies (name, slug) values ('Gate Other', 'gate-other') returning id into d;

  insert into public.gateway_upstreams (company_id, base_url, secret_enc, secret_last4) values (c, 'https://app.example.com/api', enc, 'abcd');
  begin insert into public.gateway_upstreams (company_id, base_url, secret_enc, secret_last4) values (c, 'https://second.example.com', enc, 'abcd'); assert false, 'one upstream';
  exception when unique_violation then null; end;
  begin insert into public.gateway_upstreams (company_id, base_url, secret_enc, secret_last4) values (d, 'http://plain.example.com', enc, 'abcd'); assert false, 'https only';
  exception when check_violation then null; end;

  insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'List orders', 'GET', '/orders');
  insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'Get order', 'GET', '/orders/{id}') returning id into r;
  begin insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'Again', 'GET', '/orders'); assert false, 'route once';
  exception when unique_violation then null; end;
  begin insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'Up', 'GET', '/orders/../admin'); assert false, 'dot segments';
  exception when check_violation then null; end;
  begin insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'Slash', 'GET', '/orders//x'); assert false, 'double slash';
  exception when check_violation then null; end;
  begin insert into public.gateway_routes (company_id, name, method, path_template) values (c, 'Method', 'TRACE', '/x'); assert false, 'method list';
  exception when check_violation then null; end;

  insert into public.sub_merchants (company_id, name, reference) values (c, 'Shop One', 'shop-1') returning id into s;
  insert into public.sub_merchants (company_id, name, reference) values (d, 'Shop Other', 'shop-1') returning id into s2;
  begin insert into public.sub_merchants (company_id, name, reference) values (c, 'Dup', 'shop-1'); assert false, 'reference once per company';
  exception when unique_violation then null; end;
  begin insert into public.sub_merchants (company_id, name, reference) values (c, 'Bad', 'has space'); assert false, 'reference shape';
  exception when check_violation then null; end;

  insert into public.sub_merchant_keys (company_id, sub_merchant_id, name, key_prefix, key_hash, last_chars) values (c, s, 'Main', 'kd_sub_AbCd', h1, 'wxyz') returning id into k;
  begin insert into public.sub_merchant_keys (company_id, sub_merchant_id, name, key_prefix, key_hash, last_chars) values (c, s, 'Same hash', 'kd_sub_AbCd', h1, 'wxyz'); assert false, 'hash once';
  exception when unique_violation then null; end;
  begin insert into public.sub_merchant_keys (company_id, sub_merchant_id, name, key_prefix, key_hash, last_chars) values (c, s2, 'Foreign', 'kd_sub_AbCd', h2, 'wxyz'); assert false, 'sub-merchant of another company';
  exception when sqlstate 'P0002' then null; end;
  begin update public.sub_merchant_keys set key_hash = h2 where id = k; assert false, 'hash fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.sub_merchant_keys set revoked_at = now() where id = k;

  update public.sub_merchants set status = 'closed' where id = s;
  begin update public.sub_merchants set status = 'active' where id = s; assert false, 'closed stays closed';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.gateway_calls (company_id, sub_merchant_id, key_id, route_id, method, path_template, status_code, outcome) values (c, s, k, r, 'GET', '/orders/{id}', 200, 'ok');
  begin insert into public.gateway_calls (company_id, sub_merchant_id, method, outcome) values (d, s, 'GET', 'ok'); assert false, 'call of another company';
  exception when sqlstate 'P0002' then null; end;
  begin update public.gateway_calls set status_code = 500 where company_id = c; assert false, 'log is append-only';
  exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.gateway_calls where company_id = c; assert false, 'log cannot be deleted';
  exception when object_not_in_prerequisite_state then null; end;

  assert public.kd_gateway_hit(k, c, w) = 1, 'first hit';
  assert public.kd_gateway_hit(k, c, w) = 2, 'second hit';
  assert public.kd_gateway_hit(k, c, w + interval '1 minute') = 1, 'next window';
end $$;
