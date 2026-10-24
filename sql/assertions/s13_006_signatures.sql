-- path: sql/assertions/s13_006_signatures.sql
-- Signing: one signature per signer, a wrong checksum is refused, sequential order is kept, the last signature closes the
-- contract, a closed contract cannot be signed, a decline ends the contract, evidence rows are a log.
do $$
declare
  c uuid; k uuid; k2 uuid; s1 uuid; s2 uuid; d2 uuid; n integer; st text;
  h text := repeat('e', 64); stmt text := 'I have read this contract and agree to sign it electronically.'; sh text := repeat('f', 64);
begin
  insert into public.companies (name, slug) values ('Sign Co', 'sign-co') returning id into c;
  insert into public.contracts (company_id, title, body_html, signing_order, status, body_hash) values (c, 'Sequential deal', '<p>x</p>', 'sequential', 'sent', h) returning id into k;
  insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k, 1, 'First Signer', 'one@example.com') returning id into s1;
  insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k, 2, 'Second Signer', 'two@example.com') returning id into s2;

  begin perform public.kd_contract_sign(c, s2, h, 'typed', 'Second Signer', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'signed out of turn';
  exception when sqlstate '55000' then null; end;
  begin perform public.kd_contract_sign(c, s1, repeat('0', 64), 'typed', 'First Signer', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'wrong checksum';
  exception when sqlstate '22000' then null; end;
  begin perform public.kd_contract_sign(c, s1, h, 'drawn', 'First Signer', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'drawn without image';
  exception when check_violation then null; end;

  st := public.kd_contract_sign(c, s1, h, 'typed', 'First Signer', null, null, stmt, sh, '203.0.113.0', h, '{"v":1}'::jsonb, 'Agent', 'Chrome on Windows', null);
  assert st = 'partly_signed', 'one of two signed';
  begin perform public.kd_contract_sign(c, s1, h, 'typed', 'First Signer', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'signed twice';
  exception when sqlstate '22023' then null; end;
  st := public.kd_contract_sign(c, s2, h, 'drawn', 'Second Signer', gen_random_uuid(), h, stmt, sh, null, null, null, null, null, null);
  assert st = 'signed', 'all signed';
  assert (select signed_at from public.contracts where id = k) is not null, 'signed time set';
  select count(*) into n from public.signatures where contract_id = k;
  assert n = 2, 'two signatures';
  begin perform public.kd_contract_sign(c, s2, h, 'typed', 'Second Signer', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'closed contract signed';
  exception when sqlstate '22023' then null; end;
  begin update public.signatures set typed_name = 'Changed'; assert false, 'evidence edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.signatures; assert false, 'evidence deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;

  insert into public.contracts (company_id, title, body_html, status, body_hash) values (c, 'Declined deal', '<p>x</p>', 'sent', h) returning id into k2;
  insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k2, 1, 'Decliner', 'no@example.com') returning id into d2;
  perform public.kd_contract_decline(c, d2, 'Not interested');
  assert (select status from public.contracts where id = k2) = 'declined', 'decline closes the contract';
  begin perform public.kd_contract_decline(c, d2, 'again'); assert false, 'declined twice';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_contract_sign(c, d2, h, 'typed', 'Decliner', null, null, stmt, sh, null, null, null, null, null, null); assert false, 'declined contract signed';
  exception when sqlstate '22023' then null; end;
end
$$;
