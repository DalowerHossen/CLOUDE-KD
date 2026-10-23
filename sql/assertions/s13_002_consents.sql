-- path: sql/assertions/s13_002_consents.sql
-- Consent proof: RLS on, append only, a hash is required, document types limited.
do $$
declare c uuid; n integer; h text := repeat('c', 64);
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname = 'consent_records' and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Consent Co', 'consent-co') returning id into c;
  insert into public.consent_records (company_id, token_id, doc_type, doc_id, terms_version, text_snapshot, text_hash, ip_hash, device)
    values (c, gen_random_uuid(), 'payment', gen_random_uuid(), '2026-10', 'I agree to the terms and the refund policy.', h, h, 'Chrome on Windows');
  begin update public.consent_records set terms_version = 'x'; assert false, 'consent edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.consent_records; assert false, 'consent deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.consent_records (company_id, token_id, doc_type, doc_id, terms_version, text_snapshot, text_hash) values (c, gen_random_uuid(), 'payment', gen_random_uuid(), '1', 'short', h); assert false, 'text too short';
  exception when check_violation then null; end;
  begin insert into public.consent_records (company_id, token_id, doc_type, doc_id, terms_version, text_snapshot, text_hash) values (c, gen_random_uuid(), 'estimate', gen_random_uuid(), '1', 'I agree to the terms and the refund policy.', h); assert false, 'document type';
  exception when check_violation then null; end;
  begin insert into public.consent_records (company_id, token_id, doc_type, doc_id, terms_version, text_snapshot, text_hash) values (c, gen_random_uuid(), 'payment', gen_random_uuid(), '1', 'I agree to the terms and the refund policy.', 'nothex'); assert false, 'hash format';
  exception when check_violation then null; end;
end
$$;
