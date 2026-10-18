-- path: sql/assertions/s13_005_contracts.sql
-- Contracts: RLS on, numbers come from one sequence, a sent contract needs its hash, signers are unique per contract,
-- versions and events are logs.
do $$
declare c uuid; k uuid; n integer; s uuid; saved uuid; v integer;
begin
  select count(*) into n from pg_class r join pg_namespace x on x.oid = r.relnamespace
    where x.nspname = 'public' and r.relname in ('contract_templates', 'contracts', 'contract_versions', 'contract_signers', 'contract_events') and not r.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Contract Co', 'contract-co') returning id into c;
  insert into public.contracts (company_id, title, body_html) values (c, 'Service agreement', '<p>Hello</p>') returning id into k;
  insert into public.contracts (company_id, title, body_html) values (c, 'Second agreement', '<p>Hello</p>');
  select count(distinct number) into n from public.contracts where company_id = c;
  assert n = 2, 'numbers must differ';
  begin update public.contracts set status = 'sent' where id = k; assert false, 'sent without a hash';
  exception when check_violation then null; end;
  update public.contracts set status = 'sent', body_hash = repeat('a', 64) where id = k;
  begin update public.contracts set status = 'finished' where id = k; assert false, 'status list';
  exception when check_violation then null; end;
  begin update public.contracts set effective_on = '2026-12-01', ends_on = '2026-01-01' where id = k; assert false, 'end before start';
  exception when check_violation then null; end;
  insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k, 1, 'Jane Doe', 'jane@example.com') returning id into s;
  begin insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k, 2, 'Jane Again', 'jane@example.com'); assert false, 'same e-mail twice';
  exception when unique_violation then null; end;
  begin insert into public.contract_signers (company_id, contract_id, position, name, email) values (c, k, 3, 'Bad', 'Not An Email'); assert false, 'e-mail format';
  exception when check_violation then null; end;
  insert into public.contract_versions (company_id, contract_id, version_no, title, body_html) values (c, k, 1, 'Service agreement', '<p>Hello</p>');
  begin update public.contract_versions set title = 'x'; assert false, 'version edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.contract_versions (company_id, contract_id, version_no, title, body_html) values (c, k, 1, 'dup', 'x'); assert false, 'version number twice';
  exception when unique_violation then null; end;
  insert into public.contract_events (company_id, contract_id, kind) values (c, k, 'created');
  begin delete from public.contract_events; assert false, 'event deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.contract_events (company_id, contract_id, kind) values (c, k, 'teleported'); assert false, 'event kind';
  exception when check_violation then null; end;
  -- the save function: create, edit, stale edit, locked edit, signers replaced, versions counted
  saved := public.kd_contract_save(c, null, null, 0,
    '{"title":"Retainer","body_html":"<p>One</p>","amount":"100.5"}'::jsonb,
    '[{"position":1,"name":"Jane Doe","email":"Jane@Example.com"},{"position":2,"name":"John Roe","email":"john@example.com"}]'::jsonb);
  select count(*) into n from public.contract_signers where contract_id = saved and deleted_at is null;
  assert n = 2, 'two signers saved';
  assert exists (select 1 from public.contract_signers where contract_id = saved and email = 'jane@example.com'), 'e-mail lower cased';
  select version into v from public.contracts where id = saved;
  perform public.kd_contract_save(c, null, saved, v, '{"title":"Retainer 2","body_html":"<p>Two</p>"}'::jsonb, '[{"position":1,"name":"Jane Doe","email":"jane@example.com"}]'::jsonb);
  select count(*) into n from public.contract_signers where contract_id = saved and deleted_at is null;
  assert n = 1, 'signers replaced';
  select count(*) into n from public.contract_versions where contract_id = saved;
  assert n = 2, 'one version per save';
  begin perform public.kd_contract_save(c, null, saved, v, '{"title":"Stale","body_html":"x"}'::jsonb, '[]'::jsonb); assert false, 'stale save accepted';
  exception when serialization_failure then null; end;
  update public.contracts set status = 'sent', body_hash = repeat('b', 64) where id = saved;
  select version into v from public.contracts where id = saved;
  begin perform public.kd_contract_save(c, null, saved, v, '{"title":"Late","body_html":"x"}'::jsonb, '[]'::jsonb); assert false, 'sent contract edited';
  exception when invalid_parameter_value then null; end;
end
$$;
