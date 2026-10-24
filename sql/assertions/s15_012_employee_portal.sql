-- path: sql/assertions/s15_012_employee_portal.sql
-- Employee portal tables: RLS on; a link of one token only and for an employee of the same company; a revoked link stays revoked;
-- one declaration waits per employee; a rejected declaration needs a reason; a decided declaration does not change.
do $$
declare
  c uuid; d uuid; e uuid; ed uuid; n integer; dec uuid; l uuid; tok uuid := public.uuid_generate_v7();
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('employee_portal_links', 'employee_declarations') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Portal Co', 'portal-co') returning id into c;
  insert into public.companies (name, slug) values ('Portal Other', 'portal-other') returning id into d;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Ann', 'Lee', 'ann@portal.example', date '2026-01-01') returning id into e;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (d, 'Cy', 'Day', 'cy@portal.example', date '2026-01-01') returning id into ed;

  insert into public.employee_portal_links (company_id, employee_id, token_id, expires_at) values (c, e, tok, now() + interval '3 days') returning id into l;
  begin insert into public.employee_portal_links (company_id, employee_id, token_id, expires_at) values (c, e, tok, now() + interval '3 days'); assert false, 'one link per token';
  exception when unique_violation then null; end;
  begin insert into public.employee_portal_links (company_id, employee_id, token_id, expires_at) values (c, ed, public.uuid_generate_v7(), now() + interval '3 days'); assert false, 'employee of another company';
  exception when no_data_found then null; end;
  update public.employee_portal_links set revoked_at = now() where id = l;
  begin update public.employee_portal_links set revoked_at = null where id = l; assert false, 'revoked stays revoked';
  exception when object_not_in_prerequisite_state then null; end;

  insert into public.employee_declarations (company_id, employee_id, filing_status, allowances) values (c, e, 'single', 1) returning id into dec;
  begin insert into public.employee_declarations (company_id, employee_id, filing_status, allowances) values (c, e, 'married', 2); assert false, 'one pending declaration';
  exception when unique_violation then null; end;
  begin insert into public.employee_declarations (company_id, employee_id, allowances) values (c, e, 51); assert false, 'allowances up to 50';
  exception when check_violation or unique_violation then null; end;
  begin update public.employee_declarations set status = 'rejected', decided_at = now() where id = dec; assert false, 'rejection needs a reason';
  exception when check_violation then null; end;
  begin update public.employee_declarations set status = 'approved' where id = dec; assert false, 'a decision needs its time';
  exception when check_violation then null; end;
  update public.employee_declarations set status = 'approved', decided_at = now() where id = dec;
  begin update public.employee_declarations set allowances = 9 where id = dec; assert false, 'decided declaration';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.employee_declarations (company_id, employee_id, filing_status, allowances) values (c, e, 'married', 2);
end
$$;
