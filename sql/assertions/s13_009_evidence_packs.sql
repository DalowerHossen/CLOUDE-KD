-- path: sql/assertions/s13_009_evidence_packs.sql
-- Evidence packs: RLS on, one row per version of a dispute, checksum format, a pack is never changed or deleted.
do $$
declare c uuid; cl uuid; inv uuid; pay uuid; d uuid; n integer; h text := repeat('9', 64);
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname = 'evidence_packs' and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Pack Co', 'pack-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Client') returning id into cl;
  insert into public.invoices (company_id, client_id, status, issue_date, due_date, bill_to) values (c, cl, 'sent', current_date, current_date, '{}'::jsonb) returning id into inv;
  insert into public.payments (company_id, invoice_id, client_id, amount, idempotency_key, status) values (c, inv, cl, 100, 'key-pack-1234', 'captured') returning id into pay;
  insert into public.disputes (company_id, payment_id, invoice_id, processor_id, source_event_id, amount, due_at) values (c, pay, inv, 'stripe', 'evt_pack', 100, now() + interval '7 days') returning id into d;

  insert into public.evidence_packs (company_id, dispute_id, version_no, pdf_file_id, zip_file_id, pdf_hash, zip_hash, manifest, sections, processor_id, retain_until)
    values (c, d, 1, gen_random_uuid(), gen_random_uuid(), h, h, '{"files":[]}'::jsonb, '{"invoice":true}'::jsonb, 'stripe', now() + interval '18 months');
  begin insert into public.evidence_packs (company_id, dispute_id, version_no, pdf_file_id, zip_file_id, pdf_hash, zip_hash, manifest, sections, processor_id, retain_until)
    values (c, d, 1, gen_random_uuid(), gen_random_uuid(), h, h, '{}'::jsonb, '{}'::jsonb, 'stripe', now()); assert false, 'same version twice';
  exception when unique_violation then null; end;
  insert into public.evidence_packs (company_id, dispute_id, version_no, pdf_file_id, zip_file_id, pdf_hash, zip_hash, manifest, sections, processor_id, retain_until)
    values (c, d, 2, gen_random_uuid(), gen_random_uuid(), h, h, '{}'::jsonb, '{}'::jsonb, 'stripe', now());
  begin insert into public.evidence_packs (company_id, dispute_id, version_no, pdf_file_id, zip_file_id, pdf_hash, zip_hash, manifest, sections, processor_id, retain_until)
    values (c, d, 3, gen_random_uuid(), gen_random_uuid(), 'nothex', h, '{}'::jsonb, '{}'::jsonb, 'stripe', now()); assert false, 'hash format';
  exception when check_violation then null; end;
  begin update public.evidence_packs set pdf_hash = repeat('1', 64); assert false, 'pack edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.evidence_packs; assert false, 'pack deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
end
$$;
