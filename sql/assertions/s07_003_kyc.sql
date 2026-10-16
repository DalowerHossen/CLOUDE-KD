-- path: sql/assertions/s07_003_kyc.sql
-- KYC tables: one open submission per company, one live document per type, append-only view log, duplicate lookup.
do $$
declare
  c1 uuid;
  c2 uuid;
  s1 uuid;
  s2 uuid;
  d1 uuid;
  viewer uuid := gen_random_uuid();
begin
  insert into public.companies (name, slug) values ('Kyc One', 'kyc-one') returning id into c1;
  insert into public.companies (name, slug) values ('Kyc Two', 'kyc-two') returning id into c2;
  insert into public.kyc_submissions (company_id) values (c1) returning id into s1;
  begin insert into public.kyc_submissions (company_id) values (c1); assert false, 'one open submission per company';
  exception when unique_violation then null; end;
  begin insert into public.kyc_submissions (company_id, status) values (c2, 'pending'); assert false, 'status checked';
  exception when check_violation then null; end;
  insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c1, s1, 'id_front', gen_random_uuid(), 'id.png', 'image/png', repeat('a', 64)) returning id into d1;
  begin insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash) values (c1, s1, 'id_front', gen_random_uuid(), 'id2.png', 'image/png', repeat('b', 64)); assert false, 'one live document per type';
  exception when unique_violation then null; end;
  begin insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash) values (c1, s1, 'selfie', gen_random_uuid(), 's.png', 'image/png', repeat('c', 64)); assert false, 'document type checked';
  exception when check_violation then null; end;
  begin insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash) values (c1, s1, 'id_back', gen_random_uuid(), 'x.exe', 'application/x-msdownload', repeat('d', 64)); assert false, 'mime type checked';
  exception when check_violation then null; end;
  update public.kyc_documents set deleted_at = now() where id = d1;
  insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c1, s1, 'id_front', gen_random_uuid(), 'id3.png', 'image/png', repeat('a', 64));
  assert public.kd_kyc_duplicate_of(c2, repeat('a', 64)) = c1, 'same content in another company is found';
  assert public.kd_kyc_duplicate_of(c1, repeat('a', 64)) is null, 'own documents are not duplicates';
  insert into public.kyc_document_views (company_id, document_id, viewer_id, viewer_role, purpose)
    select c1, id, viewer, 'admin_staff', 'review' from public.kyc_documents where company_id = c1 and deleted_at is null limit 1;
  begin update public.kyc_document_views set purpose = 'recheck'; assert false, 'view log cannot change';
  exception when sqlstate '22023' then null; end;
  begin delete from public.kyc_document_views; assert false, 'view log cannot be deleted';
  exception when sqlstate '22023' then null; end;
  update public.kyc_submissions set status = 'approved' where id = s1;
  insert into public.kyc_submissions (company_id) values (c1) returning id into s2;
  assert s2 is not null, 'a new submission may follow a decided one';
  assert not has_table_privilege('authenticated', 'public.kyc_documents', 'select'), 'closed to clients';
end
$$;
