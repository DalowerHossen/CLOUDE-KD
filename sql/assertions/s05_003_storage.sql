-- path: sql/assertions/s05_003_storage.sql
-- Signed download grants: expiry, use limit, deleted file; file access log append-only; one Drive link per company.
do $$
declare
  c uuid := public.uuid_generate_v7(); f uuid; n int; r record; g uuid;
  h text := repeat('d', 64);
begin
  insert into public.companies (id, name, slug) values (c, 'S3', 'storage-a');
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'invoice', 'a.pdf', 'application/pdf', 100, repeat('e', 64), 'supabase', 'k/g1', 1, repeat('i', 16), repeat('t', 24)) returning id into f;
  insert into public.signed_url_grants (company_id, file_id, token_hash, expires_at, max_uses) values (c, f, h, now() + interval '1 hour', 2);
  select * into r from public.kd_grant_redeem(h);
  assert r.file_id = f and r.session_required, 'first use';
  select count(*) into n from public.kd_grant_redeem(h);
  assert n = 1, 'second use';
  select count(*) into n from public.kd_grant_redeem(h);
  assert n = 0, 'use limit';
  select count(*) into n from public.kd_grant_redeem(repeat('0', 64));
  assert n = 0, 'unknown token';
  insert into public.signed_url_grants (company_id, file_id, token_hash, expires_at) values (c, f, repeat('1', 64), now() - interval '1 second');
  select count(*) into n from public.kd_grant_redeem(repeat('1', 64));
  assert n = 0, 'expired grant';
  insert into public.signed_url_grants (company_id, file_id, token_hash, expires_at) values (c, f, repeat('2', 64), now() + interval '1 hour') returning id into g;
  update public.files set deleted_at = now() where id = f;
  select count(*) into n from public.kd_grant_redeem(repeat('2', 64));
  assert n = 0, 'grant of a deleted file';
  begin insert into public.signed_url_grants (company_id, file_id, token_hash, expires_at) values (c, f, repeat('2', 64), now()); assert false, 'token hashes are unique';
  exception when unique_violation then null; end;
  assert public.kd_grant_purge() >= 0, 'purge runs';

  insert into public.file_access_log (company_id, file_id, action) values (c, f, 'download');
  begin update public.file_access_log set action = 'delete' where file_id = f; assert false, 'log update allowed';
  exception when assert_failure then raise; when others then null; end;
  begin delete from public.file_access_log where file_id = f; assert false, 'log delete allowed';
  exception when assert_failure then raise; when others then null; end;
  begin insert into public.file_access_log (company_id, file_id, action) values (c, f, 'steal'); assert false, 'action checked';
  exception when check_violation then null; end;

  insert into public.drive_connections (company_id, refresh_token) values (c, '{"ciphertext":"x"}'::jsonb);
  begin insert into public.drive_connections (company_id, refresh_token) values (c, '{"ciphertext":"y"}'::jsonb); assert false, 'one link per company';
  exception when unique_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.drive_connections', 'select'), 'tokens are closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_grant_redeem(text)', 'execute'), 'service role only';
end
$$;
