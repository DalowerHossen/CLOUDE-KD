-- path: sql/assertions/s05_005_migrations.sql
-- Migration jobs: enqueue only files on the other provider, claim in batches, retry then fail, counters, completion,
-- one running migration per company.
do $$
declare
  c uuid := public.uuid_generate_v7(); m uuid; m2 uuid; n int; f1 uuid; f2 uuid; f3 uuid;
begin
  insert into public.companies (id, name, slug) values (c, 'S5', 'migrate-a');
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'invoice', 'a.pdf', 'application/pdf', 1, repeat('1', 64), 'supabase', 'm/1', 1, repeat('i', 16), repeat('t', 24)) returning id into f1;
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'invoice', 'b.pdf', 'application/pdf', 1, repeat('2', 64), 'supabase', 'm/2', 1, repeat('i', 16), repeat('t', 24)) returning id into f2;
  insert into public.files (company_id, category, name, mime_type, size_bytes, content_hash, storage_provider, storage_ref, key_version, enc_iv, enc_tag)
  values (c, 'invoice', 'c.pdf', 'application/pdf', 1, repeat('3', 64), 'google_drive', 'drive-id', 1, repeat('i', 16), repeat('t', 24)) returning id into f3;

  insert into public.storage_migrations (company_id, target_provider) values (c, 'google_drive') returning id into m;
  begin insert into public.storage_migrations (company_id, target_provider) values (c, 'supabase'); assert false, 'one running migration per company';
  exception when unique_violation then null; end;
  assert public.kd_migration_enqueue_all(m) = 2, 'files already on the target are left out';
  assert (select item_count from public.storage_migrations where id = m) = 2, 'item count';
  assert public.kd_migration_enqueue_all(m) = 0, 'enqueue is repeatable';

  select count(*) into n from public.kd_migration_claim(1);
  assert n = 1, 'claim respects the limit';
  select count(*) into n from public.kd_migration_claim(10);
  assert n = 1, 'claimed items are not handed out again';
  select count(*) into n from public.kd_migration_claim(10);
  assert n = 0, 'nothing left to claim';

  perform public.kd_migration_item_result((select id from public.storage_migration_items where file_id = f1), 'done', null);
  assert (select done_count from public.storage_migrations where id = m) = 1, 'done counter';
  assert (select status from public.storage_migrations where id = m) = 'running', 'still running';
  perform public.kd_migration_item_result((select id from public.storage_migration_items where file_id = f2), 'failed', 'drive down');
  assert (select status from public.storage_migration_items where file_id = f2) = 'pending', 'a failed item is retried';
  update public.storage_migration_items set attempts = 4 where file_id = f2;
  perform public.kd_migration_item_result((select id from public.storage_migration_items where file_id = f2), 'failed', 'drive down');
  assert (select status from public.storage_migration_items where file_id = f2) = 'failed', 'attempts used up';
  assert (select status from public.storage_migrations where id = m) = 'done', 'migration closes when nothing is open';
  assert (select failed_count from public.storage_migrations where id = m) = 1 and (select last_error from public.storage_migrations where id = m) = 'drive down', 'failure is reported';

  insert into public.storage_migrations (company_id, target_provider) values (c, 'supabase') returning id into m2;
  assert public.kd_migration_enqueue_all(m2) = 1, 'new migration after the old one finished';
  update public.storage_migrations set status = 'paused' where id = m2;
  select count(*) into n from public.kd_migration_claim(10);
  assert n = 0, 'paused migrations hand out nothing';
  begin perform public.kd_migration_item_result((select id from public.storage_migration_items where migration_id = m2 limit 1), 'weird', null); assert false, 'status checked';
  exception when invalid_parameter_value then null; end;
  assert not has_function_privilege('authenticated', 'public.kd_migration_claim(integer)', 'execute'), 'service role only';
end
$$;
