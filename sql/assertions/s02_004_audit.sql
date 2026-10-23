-- path: sql/assertions/s02_004_audit.sql
-- Audit immutability, hash chain, tamper and gap detection, row trigger, access control.
do $$
declare
  c uuid := public.uuid_generate_v7();
  res jsonb;
  s1 bigint; s2 bigint; s3 bigint;
  n int;
begin
  insert into public.companies (id, name, slug) values (c, 'Aud', 'aud-co');
  s1 := public.kd_audit_append(c, null, 'owner', null, 'invoice.created', 'invoice', null, '10.0.0.0/24', 'h1', 'u1', 'corr1', '{"k":1}'::jsonb);
  s2 := public.kd_audit_append(c, null, 'owner', null, 'invoice.updated', 'invoice', null, null, null, null, 'corr2', '{}'::jsonb);
  s3 := public.kd_audit_append(c, null, 'owner', null, 'invoice.voided', 'invoice', null, null, null, null, 'corr3', '{}'::jsonb);
  assert s2 = s1 + 1 and s3 = s2 + 1, 'sequence increments by one';

  res := public.kd_audit_verify(c::text);
  assert (res ->> 'ok')::boolean, 'untouched chain verifies: ' || res::text;

  -- the company insert itself was audited by the row trigger
  select count(*) into n from public.audit_logs where company_id = c and action = 'companies.insert';
  assert n = 1, 'row trigger writes an entry';
  select count(*) into n from public.audit_logs where company_id = c and metadata::text like '%Aud%';
  assert n = 0, 'row trigger never stores values';

  begin update public.audit_logs set action = 'x.y' where company_id = c; assert false, 'update must fail';
  exception when insufficient_privilege then null; end;
  begin delete from public.audit_logs where company_id = c; assert false, 'delete must fail';
  exception when insufficient_privilege then null; end;
  begin truncate public.audit_logs; assert false, 'truncate must fail';
  exception when insufficient_privilege then null; end;
  insert into public.audit_checkpoints (company_id, chain_key, from_sequence, to_sequence, entry_count, merkle_root, last_entry_hash, signature, key_id)
  values (c, c::text, 1, 3, 3, 'r', 'h', 's', 'k1');
  begin update public.audit_checkpoints set key_id = 'x'; assert false, 'checkpoint update must fail';
  exception when insufficient_privilege then null; end;

  set local role service_role;
  begin update public.audit_logs set action = 'x.y' where company_id = c; assert false, 'service role update must fail';
  exception when insufficient_privilege then null; end;
  begin delete from public.audit_logs where company_id = c; assert false, 'service role delete must fail';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role authenticated;
  begin insert into public.audit_logs (action, resource_type, prev_hash, entry_hash, chain_key, sequence) values ('a.b', 'x', '', '', '', 0);
    assert false, 'authenticated cannot insert';
  exception when insufficient_privilege then null; end;
  reset role;

  -- tamper as a superuser who disables the trigger: verification reports the exact sequence
  alter table public.audit_logs disable trigger trg_audit_logs_immutable;
  update public.audit_logs set metadata = '{"k":2}'::jsonb where company_id = c and sequence = s1;
  alter table public.audit_logs enable trigger trg_audit_logs_immutable;
  res := public.kd_audit_verify(c::text);
  assert not (res ->> 'ok')::boolean, 'tampered chain fails';
  assert (res ->> 'firstBrokenSequence')::bigint = s1, 'exact sequence reported';

  -- gap detection
  alter table public.audit_logs disable trigger trg_audit_logs_immutable;
  update public.audit_logs set metadata = '{"k":1}'::jsonb where company_id = c and sequence = s1;
  delete from public.audit_logs where company_id = c and sequence = s2;
  alter table public.audit_logs enable trigger trg_audit_logs_immutable;
  res := public.kd_audit_verify(c::text);
  assert not (res ->> 'ok')::boolean and (res -> 'gaps') = to_jsonb(array[s2]), 'gap reported: ' || res::text;
end
$$;
