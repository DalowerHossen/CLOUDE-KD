-- path: sql/assertions/s16_009_ocr.sql
-- OCR tables: RLS on; settings cannot be switched on without a key and a consent; a job belongs to the company of its receipt,
-- starts queued, is one per receipt and moves in the allowed ways only; the claim takes due jobs once, recovers jobs whose lock
-- ran out, and leaves other jobs alone; a failed job needs its error text.
do $$
declare
  c uuid; d uuid; r uuid; rd uuid; j uuid; n integer; s text;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('ocr_settings', 'ocr_jobs') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Ocr Co', 'ocr-co') returning id into c;
  insert into public.companies (name, slug) values ('Ocr Other', 'ocr-other') returning id into d;
  insert into public.receipts (company_id, file_id, name, mime_type, size_bytes, sha256, ocr_status)
    values (c, public.uuid_generate_v7(), 'a.jpg', 'image/jpeg', 100, repeat('a', 64), 'pending') returning id into r;
  insert into public.receipts (company_id, file_id, name, mime_type, size_bytes, sha256, ocr_status)
    values (d, public.uuid_generate_v7(), 'b.jpg', 'image/jpeg', 100, repeat('b', 64), 'pending') returning id into rd;

  -- settings
  begin insert into public.ocr_settings (company_id, enabled) values (c, true); assert false, 'enabled needs a key and consent';
  exception when check_violation then null; end;
  begin insert into public.ocr_settings (company_id, enabled, api_key_enc) values (c, true, enc); assert false, 'enabled needs consent';
  exception when check_violation then null; end;
  insert into public.ocr_settings (company_id, enabled, api_key_enc, key_last4, consent_at) values (c, true, enc, 'abcd', now());
  begin insert into public.ocr_settings (company_id) values (c); assert false, 'one settings row per company';
  exception when unique_violation then null; end;
  begin insert into public.ocr_settings (company_id, date_order) values (d, 'ymd'); assert false, 'date order list';
  exception when check_violation then null; end;
  begin insert into public.ocr_settings (company_id, daily_limit) values (d, 0); assert false, 'daily limit from 1';
  exception when check_violation then null; end;
  begin insert into public.ocr_settings (company_id, language_hints) values (d, array['en','bn','hi','ar','th','vi']); assert false, 'five hints at most';
  exception when check_violation then null; end;

  -- jobs
  insert into public.ocr_jobs (company_id, receipt_id) values (c, r) returning id into j;
  begin insert into public.ocr_jobs (company_id, receipt_id) values (c, r); assert false, 'one job per receipt';
  exception when unique_violation then null; end;
  begin insert into public.ocr_jobs (company_id, receipt_id) values (c, rd); assert false, 'receipt of another company';
  exception when no_data_found then null; end;
  begin insert into public.ocr_jobs (company_id, receipt_id, status) values (d, rd, 'done'); assert false, 'starts queued';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.ocr_jobs set status = 'done' where id = j; assert false, 'queued cannot jump to done';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.ocr_jobs set receipt_id = rd where id = j; assert false, 'receipt fixed';
  exception when object_not_in_prerequisite_state then null; end;

  -- claim: takes the due job once
  select count(*) into n from public.kd_claim_ocr_jobs(10, 300);
  assert n = 1, 'the due job is claimed';
  select status || attempts into s from public.ocr_jobs where id = j;
  assert s = 'processing1', 'claimed job is processing, attempt 1';
  select count(*) into n from public.kd_claim_ocr_jobs(10, 300);
  assert n = 0, 'a locked job is not claimed again';
  update public.ocr_jobs set locked_until = now() - interval '1 minute' where id = j;
  select count(*) into n from public.kd_claim_ocr_jobs(10, 300);
  assert n = 1, 'a job whose lock ran out is claimed again';
  select attempts into n from public.ocr_jobs where id = j;
  assert n = 2, 'attempts counted';

  -- finish
  begin update public.ocr_jobs set status = 'failed' where id = j; assert false, 'failed needs its error';
  exception when check_violation then null; end;
  update public.ocr_jobs set status = 'done', fields = '{"total":"12.5000"}', confidence = '{"total":0.9}', finished_at = now() where id = j;
  begin update public.ocr_jobs set status = 'processing' where id = j; assert false, 'done goes only back to queued';
  exception when object_not_in_prerequisite_state then null; end;
  update public.ocr_jobs set status = 'queued', next_attempt_at = now() where id = j;
  select count(*) into n from public.kd_claim_ocr_jobs(10, 300);
  assert n = 1, 'a retried job is claimed';
  update public.ocr_jobs set status = 'failed', error = 'The receipt could not be read.', failure_reported = true where id = j;
  begin update public.ocr_jobs set failure_reported = false where id = j; assert false, 'a reported failure stays reported';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.ocr_jobs set fields = '[1]' where id = j; assert false, 'fields are an object';
  exception when check_violation then null; end;
end
$$;
