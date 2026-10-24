-- path: sql/assertions/s16_020_sub_merchant_kyc.sql
-- Sub-merchant KYC tables: RLS on; one open submission and one round number per sub-merchant; a submission belongs to the company of
-- its sub-merchant; documents belong to the company of their submission; one document per type; link hashes are unique; a rejected
-- or expired submission stays so, an approved one can only expire; the gateway gate defaults on.
do $$
declare
  c uuid; d uuid; s uuid; sd uuid; k1 uuid; k2 uuid; n integer;
  h1 text := repeat('a', 64);
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('sub_merchant_kyc', 'sub_merchant_kyc_documents', 'sub_merchant_kyc_links') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Kyc Co', 'kyc-co') returning id into c;
  insert into public.companies (name, slug) values ('Kyc Other', 'kyc-other') returning id into d;
  insert into public.sub_merchants (company_id, name, reference) values (c, 'Shop', 'shop-1') returning id into s;
  insert into public.sub_merchants (company_id, name, reference) values (d, 'Other Shop', 'shop-9') returning id into sd;

  insert into public.gateway_upstreams (company_id, base_url, secret_enc, secret_last4)
    values (c, 'https://app.example.com', '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}', 'abcd');
  assert (select kyc_required from public.gateway_upstreams where company_id = c), 'the gate is on by default';
  assert (select kyc_approved_until from public.sub_merchants where id = s) is null, 'not verified at first';

  insert into public.sub_merchant_kyc (company_id, sub_merchant_id) values (c, s) returning id into k1;
  begin insert into public.sub_merchant_kyc (company_id, sub_merchant_id, round) values (c, s, 2); assert false, 'one open submission';
  exception when unique_violation then null; end;
  begin insert into public.sub_merchant_kyc (company_id, sub_merchant_id) values (d, s); assert false, 'sub-merchant of another company';
  exception when sqlstate 'P0002' then null; end;
  begin update public.sub_merchant_kyc set round = 2 where id = k1; assert false, 'round fixed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.sub_merchant_kyc set status = 'maybe' where id = k1; assert false, 'status list';
  exception when check_violation then null; end;

  insert into public.sub_merchant_kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c, k1, 'id_front', public.uuid_generate_v7(), 'id.png', 'image/png', repeat('f', 64));
  begin insert into public.sub_merchant_kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c, k1, 'id_front', public.uuid_generate_v7(), 'id2.png', 'image/png', repeat('e', 64)); assert false, 'one document per type';
  exception when unique_violation then null; end;
  begin insert into public.sub_merchant_kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (d, k1, 'id_back', public.uuid_generate_v7(), 'id.png', 'image/png', repeat('f', 64)); assert false, 'document of another company';
  exception when sqlstate 'P0002' then null; end;
  begin insert into public.sub_merchant_kyc_documents (company_id, submission_id, doc_type, file_id, file_name, mime_type, content_hash)
    values (c, k1, 'address_proof', public.uuid_generate_v7(), 'x.exe', 'application/x-msdownload', repeat('f', 64)); assert false, 'file type list';
  exception when check_violation then null; end;

  update public.sub_merchant_kyc set status = 'rejected', decision_reason = 'Documents do not match' where id = k1;
  begin update public.sub_merchant_kyc set status = 'approved' where id = k1; assert false, 'rejected stays rejected';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.sub_merchant_kyc (company_id, sub_merchant_id, round) values (c, s, 2) returning id into k2;
  update public.sub_merchant_kyc set status = 'approved', expires_at = now() + interval '2 years' where id = k2;
  begin update public.sub_merchant_kyc set status = 'in_review' where id = k2; assert false, 'approved cannot go back';
  exception when object_not_in_prerequisite_state then null; end;
  update public.sub_merchant_kyc set status = 'expired' where id = k2;

  insert into public.sub_merchant_kyc_links (company_id, sub_merchant_id, token_hash, expires_at) values (c, s, h1, now() + interval '14 days');
  begin insert into public.sub_merchant_kyc_links (company_id, sub_merchant_id, token_hash, expires_at) values (c, s, h1, now() + interval '14 days'); assert false, 'link hash once';
  exception when unique_violation then null; end;
  begin insert into public.sub_merchant_kyc_links (company_id, sub_merchant_id, token_hash, expires_at) values (d, s, repeat('b', 64), now() + interval '1 day'); assert false, 'link of another company';
  exception when sqlstate 'P0002' then null; end;
end $$;
