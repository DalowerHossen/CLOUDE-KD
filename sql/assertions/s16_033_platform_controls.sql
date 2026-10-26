-- path: sql/assertions/s16_033_platform_controls.sql
-- Only the known control key is accepted and only once; one engaged kill switch per flag, and a released one can be engaged
-- again; one cap per company with a sane range; all three tables are closed to clients.
do $$
declare
  u uuid := gen_random_uuid();
  c uuid;
begin
  insert into public.platform_controls (key, value) values ('maintenance', '{"enabled":false}');
  begin insert into public.platform_controls (key, value) values ('maintenance', '{"enabled":true}'); assert false, 'one row per key';
  exception when unique_violation then null; end;
  begin insert into public.platform_controls (key, value) values ('theme', '{}'); assert false, 'known keys only';
  exception when check_violation then null; end;

  insert into public.kill_switches (flag_key, reason, engaged_by) values ('module.whatsapp', 'Provider outage, stop sends', u);
  begin insert into public.kill_switches (flag_key, reason, engaged_by) values ('module.whatsapp', 'Second switch for the same flag', u); assert false, 'one engaged switch per flag';
  exception when unique_violation then null; end;
  begin insert into public.kill_switches (flag_key, reason, engaged_by) values ('Bad Key', 'A reason that is long enough', u); assert false, 'flag key shape';
  exception when check_violation then null; end;
  update public.kill_switches set released_at = now(), released_by = u where flag_key = 'module.whatsapp';
  insert into public.kill_switches (flag_key, reason, engaged_by) values ('module.whatsapp', 'Engaged again after a release', u);

  select id into c from public.companies where deleted_at is null limit 1;
  if c is not null then
    insert into public.tenant_rate_limits (company_id, limit_per_minute, reason, set_by) values (c, 600, 'Heavy import for one week', u);
    begin insert into public.tenant_rate_limits (company_id, limit_per_minute, reason, set_by) values (c, 700, 'A second cap for the same company', u); assert false, 'one cap per company';
    exception when unique_violation then null; end;
    begin insert into public.tenant_rate_limits (company_id, limit_per_minute, reason, set_by) values (c, 0, 'Zero is not a cap', u); assert false, 'range';
    exception when check_violation or unique_violation then null; end;
  end if;

  assert not has_table_privilege('authenticated', 'public.platform_controls', 'select'), 'controls closed';
  assert not has_table_privilege('authenticated', 'public.kill_switches', 'select'), 'switches closed';
  assert not has_table_privilege('authenticated', 'public.tenant_rate_limits', 'select'), 'caps closed';
end $$;
