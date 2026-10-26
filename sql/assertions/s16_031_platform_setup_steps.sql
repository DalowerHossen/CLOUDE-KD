-- path: sql/assertions/s16_031_platform_setup_steps.sql
-- The eight wizard steps are accepted once each; an unknown step is still refused.
do $$
declare
  u uuid := gen_random_uuid();
  k text;
begin
  foreach k in array array['branding', 'email', 'gateways', 'plans', 'domains', 'payouts', 'whatsapp', 'analytics'] loop
    insert into public.platform_setup (step_key, choice, completed_by) values (k, 'skipped', u) on conflict do nothing;
  end loop;
  begin insert into public.platform_setup (step_key, completed_by) values ('payments', u); assert false, 'unknown step refused';
  exception when check_violation then null; end;
  delete from public.platform_setup where completed_by = u;
end $$;
