-- path: sql/assertions/s06_005_seo.sql
-- Search settings: one live row per key, an object as value, closed to clients.
do $$
begin
  insert into public.seo_settings (key, value) values ('site', '{"social": {}}'::jsonb);
  begin insert into public.seo_settings (key, value) values ('site', '{}'::jsonb); assert false, 'one row per key';
  exception when unique_violation then null; end;
  begin insert into public.seo_settings (key, value) values ('other', '"text"'::jsonb); assert false, 'value must be an object';
  exception when check_violation then null; end;
  begin insert into public.seo_settings (key, value) values ('Bad Key', '{}'::jsonb); assert false, 'key checked';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.seo_settings', 'select'), 'closed to clients';
end
$$;
