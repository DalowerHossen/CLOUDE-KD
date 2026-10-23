-- path: sql/assertions/s16_012_housekeeping.sql
-- The expiry notice of an API key can be recorded on the key without changing its identity, and a key that was noticed is not found
-- again by the query the housekeeping job uses.
do $$
declare c uuid; k uuid; n integer;
begin
  insert into public.companies (name, slug) values ('Hk Co', 'hk-co') returning id into c;
  insert into public.api_keys (company_id, name, key_prefix, key_hash, last_chars, mode, scopes, expires_at)
    values (c, 'Soon', 'kd_live_abcdef', repeat('a', 64), 'wxyz', 'live', array['read:clients'], now() + interval '3 days') returning id into k;
  select count(*) into n from public.api_keys where revoked_at is null and deleted_at is null and expires_at is not null and expiry_notice_at is null and expires_at < now() + interval '7 days';
  assert n = 1, 'the key is found before the notice';
  update public.api_keys set expiry_notice_at = now() where id = k;
  select count(*) into n from public.api_keys where revoked_at is null and deleted_at is null and expires_at is not null and expiry_notice_at is null and expires_at < now() + interval '7 days';
  assert n = 0, 'a noticed key is not found again';
  begin update public.api_keys set key_hash = repeat('b', 64) where id = k; assert false, 'identity fixed';
  exception when object_not_in_prerequisite_state then null; end;
end
$$;
