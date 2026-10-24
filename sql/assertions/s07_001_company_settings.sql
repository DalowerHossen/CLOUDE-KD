-- path: sql/assertions/s07_001_company_settings.sql
-- Tenant settings: create once, update only with the right version, one row per section, milestones once, closed to clients.
do $$
declare
  c uuid;
  v integer;
begin
  insert into public.companies (name, slug) values ('Settings Test', 'settings-test') returning id into c;
  v := public.kd_company_setting_save(c, 'profile', '{"a":1}'::jsonb, 0, null);
  assert v = 1, 'first save is version 1';
  begin perform public.kd_company_setting_save(c, 'profile', '{"a":2}'::jsonb, 0, null); assert false, 'second create refused';
  exception when sqlstate '40001' then null; end;
  v := public.kd_company_setting_save(c, 'profile', '{"a":2}'::jsonb, 1, null);
  assert v = 2, 'update bumps the version';
  begin perform public.kd_company_setting_save(c, 'profile', '{"a":3}'::jsonb, 1, null); assert false, 'stale version refused';
  exception when sqlstate '40001' then null; end;
  assert (select value ->> 'a' from public.company_settings where company_id = c and section = 'profile') = '2', 'stale write changed nothing';
  perform public.kd_company_setting_save(c, 'branding', '{}'::jsonb, 0, null);
  assert (select count(*) from public.company_settings where company_id = c) = 2, 'one row per section';
  begin insert into public.company_settings (company_id, section, value) values (c, 'Bad Section', '{}'::jsonb); assert false, 'section name checked';
  exception when check_violation then null; end;
  begin insert into public.company_settings (company_id, section, value) values (c, 'other', '[]'::jsonb); assert false, 'value must be an object';
  exception when check_violation then null; end;
  assert public.kd_milestone_record(c, 'first_invoice') = true, 'new milestone';
  assert public.kd_milestone_record(c, 'first_invoice') = false, 'milestone only once';
  assert not has_table_privilege('authenticated', 'public.company_settings', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_company_setting_save(uuid, text, jsonb, integer, uuid)', 'execute'), 'service role only';
end
$$;
