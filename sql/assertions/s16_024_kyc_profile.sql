-- path: sql/assertions/s16_024_kyc_profile.sql
-- KYC profile: RLS on, one row of settings, automatic mode needs a provider, document lists are limited to known types,
-- and the new document types are accepted.
do $$
declare n integer; c uuid; s uuid; d text;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname = 'kyc_platform_settings' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.kyc_platform_settings (mode) values ('manual');
  begin insert into public.kyc_platform_settings (mode) values ('manual'); assert false, 'one row';
  exception when unique_violation then null; end;
  begin update public.kyc_platform_settings set mode = 'automatic', provider = 'none'; assert false, 'automatic needs a provider';
  exception when check_violation then null; end;
  update public.kyc_platform_settings set mode = 'automatic', provider = 'sumsub';
  begin update public.kyc_platform_settings set required_documents = array['passport_photo']; assert false, 'known types only';
  exception when check_violation then null; end;
  begin update public.kyc_platform_settings set provider = 'other'; assert false, 'known providers only';
  exception when check_violation then null; end;
  insert into public.companies (name, slug) values ('Kyc Profile Co', 'kyc-profile-co') returning id into c;
  insert into public.kyc_submissions (company_id) values (c) returning id into s;
  foreach d in array array['id_front', 'bank_proof', 'tax_certificate', 'selfie_with_id'] loop
    insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
      values (c, s, d, public.uuid_generate_v7(), d || '.jpg', 'image/jpeg', repeat('a', 40) || d);
  end loop;
  begin insert into public.kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c, s, 'passport_photo', public.uuid_generate_v7(), 'x.jpg', 'image/jpeg', repeat('b', 40));
    assert false, 'unknown document type';
  exception when check_violation then null; end;
end $$;
