-- path: sql/assertions/s16_016_compliance.sql
-- Compliance tables: RLS on; one live restriction per country; the code and the mode are checked; a list is replaced as a whole,
-- a much smaller list is refused unless forced, the candidates search finds names by token, a normal delete stays a soft delete.
do $$
declare n integer; r integer; found integer;
  e1 jsonb := '[{"source_uid":"1","kind":"person","name":"Jane Roe","aliases":["J Roe"],"search_tokens":["jane","roe","j"],"countries":["XX"],"programs":"TEST"},{"source_uid":"2","kind":"business","name":"Acme Trading","aliases":[],"search_tokens":["acme","trading"],"countries":[],"programs":""},{"source_uid":"3","kind":"business","name":"Blue Fin","aliases":[],"search_tokens":["blue","fin"],"countries":[],"programs":""}]';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('country_restrictions', 'sanctions_entries', 'sanctions_sources') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.country_restrictions (country_code, reason) values ('KP', 'Restricted after a Security Council measure');
  begin insert into public.country_restrictions (country_code, reason) values ('KP', 'Second row for the same country'); assert false, 'one row per country';
  exception when unique_violation then null; end;
  begin insert into public.country_restrictions (country_code, reason) values ('kp1', 'Bad code for a country row'); assert false, 'country code';
  exception when check_violation then null; end;
  begin insert into public.country_restrictions (country_code, mode, reason) values ('IR', 'allow', 'Bad mode for a country row'); assert false, 'mode';
  exception when check_violation then null; end;
  begin insert into public.country_restrictions (country_code, reason) values ('IR', 'short'); assert false, 'reason length';
  exception when check_violation then null; end;
  delete from public.country_restrictions where country_code = 'KP';
  select count(*) into n from public.country_restrictions where country_code = 'KP' and deleted_at is not null;
  assert n = 1, 'delete stays soft';
  insert into public.country_restrictions (country_code, reason) values ('KP', 'Restricted again after a new measure');

  r := public.kd_sanctions_replace('un', e1, null, 'test', false);
  assert r = 3, 'three entries imported';
  select count(*) into n from public.kd_sanctions_candidates(array['roe']);
  assert n = 1, 'candidate by token';
  select count(*) into n from public.kd_sanctions_candidates(array['nothing']);
  assert n = 0, 'no candidate';
  begin perform public.kd_sanctions_replace('un', '[{"source_uid":"9","kind":"person","name":"X","aliases":[],"search_tokens":["x"],"countries":[],"programs":""}]', null, '', false);
    assert false, 'a much smaller list is refused';
  exception when invalid_parameter_value then null; end;
  r := public.kd_sanctions_replace('un', '[{"source_uid":"9","kind":"person","name":"X","aliases":[],"search_tokens":["x"],"countries":[],"programs":""}]', null, 'forced', true);
  assert r = 1, 'forced replace';
  select count(*) into n from public.sanctions_entries where source = 'un';
  assert n = 1, 'old entries are gone';
  select entry_count into n from public.sanctions_sources where source = 'un' and deleted_at is null;
  assert n = 1, 'source row updated';
  begin perform public.kd_sanctions_replace('xx', '[]', null, '', true); assert false, 'unknown list';
  exception when invalid_parameter_value then null; end;
end $$;
