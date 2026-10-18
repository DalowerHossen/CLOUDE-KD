-- path: sql/assertions/s13_004_branding.sql
-- Branding: RLS on, one row per company, colour format checked, history is a log.
do $$
declare c uuid; n integer;
begin
  select count(*) into n from pg_class k join pg_namespace s on s.oid = k.relnamespace
    where s.nspname = 'public' and k.relname in ('tenant_branding', 'branding_history') and not k.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Brand Co', 'brand-co') returning id into c;
  insert into public.tenant_branding (company_id, secondary_color) values (c, '#112233');
  begin insert into public.tenant_branding (company_id) values (c); assert false, 'second row for one company';
  exception when unique_violation then null; end;
  begin insert into public.tenant_branding (company_id, secondary_color) values (gen_random_uuid(), 'red'); assert false, 'colour format';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  insert into public.branding_history (company_id, action, before, after) values (c, 'save', '{}'::jsonb, '{"a":1}'::jsonb);
  begin update public.branding_history set action = 'reset'; assert false, 'history edited';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin delete from public.branding_history; assert false, 'history deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
  begin insert into public.branding_history (company_id, action, before, after) values (c, 'wipe', '{}'::jsonb, '{}'::jsonb); assert false, 'action';
  exception when check_violation then null; end;
end
$$;
