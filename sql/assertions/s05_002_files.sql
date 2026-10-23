-- path: sql/assertions/s05_002_files.sql
-- Files: one live record per company, category and content; checks on provider and key data; chunk upload rules;
-- monthly usage limit; known-malware list; purge of expired sessions; closed to clients.
do $$
declare
  c uuid := public.uuid_generate_v7(); c2 uuid := public.uuid_generate_v7(); u uuid := public.uuid_generate_v7();
  sid uuid; n int; r jsonb; s public.upload_sessions%rowtype;
  h text := repeat('a', 64);
begin
  insert into public.companies (id, name, slug) values (c, 'F1', 'files-a'), (c2, 'F2', 'files-b');
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'invoice', 'a.pdf', 'application/pdf', 100, h, 'supabase', 'k/1', 1, repeat('i', 16), repeat('t', 24));
  begin insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
    values (c, 'invoice', 'b.pdf', 'application/pdf', 100, h, 'supabase', 'k/2', 1, repeat('i', 16), repeat('t', 24)); assert false, 'duplicate content in a company';
  exception when unique_violation then null; end;
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c2, 'invoice', 'a.pdf', 'application/pdf', 100, h, 'supabase', 'k/3', 1, repeat('i', 16), repeat('t', 24));
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'receipt', 'a.pdf', 'application/pdf', 100, h, 'supabase', 'k/4', 1, repeat('i', 16), repeat('t', 24));
  begin insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
    values (c, 'other', 'x', 'text/csv', 5, repeat('b', 64), 'dropbox', 'k/5', 1, repeat('i', 16), repeat('t', 24)); assert false, 'provider checked';
  exception when check_violation then null; end;
  begin insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
    values (c, 'other', 'x', 'text/csv', 5, repeat('b', 64), 'supabase', 'k/6', 0, repeat('i', 16), repeat('t', 24)); assert false, 'key version required';
  exception when check_violation then null; end;
  assert public.kd_company_storage_bytes(c) = 200, 'storage total counts live files';
  update public.files set deleted_at = now() where company_id = c and category = 'receipt';
  assert public.kd_company_storage_bytes(c) = 100, 'deleted files do not count';

  assert not public.kd_known_malware(h), 'unknown hash';
  insert into public.malware_hashes (content_hash, label) values (h, 'test sample');
  assert public.kd_known_malware(h), 'known hash';

  insert into public.upload_sessions (company_id, user_id, category, name, file_bytes, chunk_bytes, chunk_count, expires_at)
  values (c, u, 'attachment', 'big.pdf', 150000, 100000, 2, now() + interval '1 hour') returning id into sid;
  assert public.kd_upload_chunk_put(sid, 0, '\x00'::bytea || decode(repeat('ab', 99999), 'hex')) = 1, 'first chunk';
  begin perform public.kd_upload_chunk_put(sid, 0, decode('ab', 'hex')); assert false, 'short non-final chunk';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_upload_chunk_put(sid, 5, decode('ab', 'hex')); assert false, 'index range';
  exception when invalid_parameter_value then null; end;
  assert public.kd_upload_chunk_put(sid, 0, '\x00'::bytea || decode(repeat('cd', 99999), 'hex')) = 1, 'repeat replaces';
  begin perform public.kd_upload_begin_complete(sid, u); assert false, 'complete needs all chunks';
  exception when invalid_parameter_value then null; end;
  assert public.kd_upload_chunk_put(sid, 1, decode(repeat('ef', 50000), 'hex')) = 2, 'second chunk';
  begin perform public.kd_upload_begin_complete(sid, public.uuid_generate_v7()); assert false, 'other user';
  exception when no_data_found then null; end;
  s := public.kd_upload_begin_complete(sid, u);
  assert s.status = 'completing', 'completing';
  begin perform public.kd_upload_begin_complete(sid, u); assert false, 'only one assembler';
  exception when no_data_found then null; end;
  begin perform public.kd_upload_chunk_put(sid, 1, decode(repeat('ef', 50000), 'hex')); assert false, 'no chunks after completing';
  exception when no_data_found then null; end;
  update public.upload_sessions set status = 'complete' where id = sid;
  assert public.kd_upload_purge() >= 2, 'chunks of finished sessions are removed';
  assert (select count(*) from public.upload_chunks where session_id = sid) = 0, 'chunks gone';

  r := public.kd_upload_usage_add(c, 600, 1000);
  assert (r->>'allowed')::boolean and (r->>'bytes')::bigint = 600, 'usage added';
  r := public.kd_upload_usage_add(c, 500, 1000);
  assert not (r->>'allowed')::boolean and (r->>'bytes')::bigint = 600, 'month limit refuses';
  r := public.kd_upload_usage_add(c2, 900, 1000);
  assert (r->>'allowed')::boolean, 'limits are per company';

  assert not has_table_privilege('authenticated', 'public.files', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_upload_chunk_put(uuid, integer, bytea)', 'execute'), 'service role only';
  assert (select relrowsecurity from pg_class where oid = 'public.files'::regclass), 'rls files';
  assert (select relrowsecurity from pg_class where oid = 'public.upload_chunks'::regclass), 'rls chunks';
end
$$;
