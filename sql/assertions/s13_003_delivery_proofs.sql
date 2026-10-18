-- path: sql/assertions/s13_003_delivery_proofs.sql
-- Delivery proof: RLS on, append only, one proof per outbox row, hash format, document types limited.
do $$
declare c uuid; n integer; h text := repeat('d', 64); o uuid := gen_random_uuid();
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname = 'delivery_proofs' and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Proof Co', 'proof-co') returning id into c;
  insert into public.delivery_proofs (company_id, outbox_id, template, doc_type, doc_id, to_masked, to_enc, subject, content_hash)
    values (c, o, 'client.receipt', 'receipt', gen_random_uuid(), 'a***@example.com', '{"v":1}'::jsonb, 'Receipt PAY-1', h);
  begin update public.delivery_proofs set subject = 'x'; assert false, 'proof edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.delivery_proofs; assert false, 'proof deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.delivery_proofs (company_id, outbox_id, template, doc_type, to_masked, to_enc, subject, content_hash)
    values (c, o, 'client.receipt', 'receipt', 'a***@example.com', '{"v":1}'::jsonb, 'Again', h); assert false, 'second proof for one message';
  exception when unique_violation then null; end;
  begin insert into public.delivery_proofs (company_id, outbox_id, template, doc_type, to_masked, to_enc, subject, content_hash)
    values (c, gen_random_uuid(), 'client.receipt', 'payslip', 'a***@example.com', '{"v":1}'::jsonb, 'x', h); assert false, 'document type';
  exception when check_violation then null; end;
  begin insert into public.delivery_proofs (company_id, outbox_id, template, doc_type, to_masked, to_enc, subject, content_hash)
    values (c, gen_random_uuid(), 'client.receipt', 'receipt', 'a***@example.com', '{"v":1}'::jsonb, 'x', 'nothex'); assert false, 'hash format';
  exception when check_violation then null; end;
end
$$;
