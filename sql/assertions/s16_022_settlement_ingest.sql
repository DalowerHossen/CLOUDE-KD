-- path: sql/assertions/s16_022_settlement_ingest.sql
-- Ingest keys: RLS on; the hash is unique and fixed; the company is fixed; a revoked key stays revoked; limits are bounded.
do $$
declare c uuid; k uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname = 'settlement_ingest_keys' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Ingest Co', 'ingest-co') returning id into c;
  insert into public.settlement_ingest_keys (company_id, name, key_prefix, key_hash, last_chars)
    values (c, 'App', 'kd_stl_AbCd', repeat('a', 64), 'wxyz') returning id into k;
  begin insert into public.settlement_ingest_keys (company_id, name, key_prefix, key_hash, last_chars)
    values (c, 'Same', 'kd_stl_AbCd', repeat('a', 64), 'wxyz'); assert false, 'hash once';
  exception when unique_violation then null; end;
  begin insert into public.settlement_ingest_keys (company_id, name, key_prefix, key_hash, last_chars, rate_limit_per_minute)
    values (c, 'Fast', 'kd_stl_AbCd', repeat('b', 64), 'wxyz', 0); assert false, 'limit range';
  exception when check_violation then null; end;
  begin update public.settlement_ingest_keys set key_hash = repeat('c', 64) where id = k; assert false, 'hash fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.settlement_ingest_keys set revoked_at = now() where id = k;
  begin update public.settlement_ingest_keys set revoked_at = null where id = k; assert false, 'revoked stays revoked';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
