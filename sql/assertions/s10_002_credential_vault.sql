-- path: sql/assertions/s10_002_credential_vault.sql
-- Credential vault rules: new version on every save, processor disabled by a save, enabling needs a passing test for the
-- current credentials, mode and environment, an environment change disables, stale versions are refused.
do $$
declare
  v integer; ver integer; tid uuid; modes jsonb := '[{"id":"collectjs","label":"Collect.js","isDefault":true},{"id":"payment_component","label":"Payment Component","isDefault":false}]';
  actor uuid := gen_random_uuid();
begin
  perform public.kd_processor_ensure('nmi', modes);
  perform public.kd_processor_ensure('nmi', modes);
  assert (select count(*) from public.processor_modes where processor_id = 'nmi') = 2, 'two modes, once';
  assert (select active_mode from public.processors where processor_id = 'nmi') = 'collectjs', 'the default mode is active';
  assert (select count(*) from public.processor_modes where processor_id = 'nmi' and is_active) = 1, 'one active mode';

  -- cannot test or enable before credentials
  begin perform public.kd_processor_record_test('nmi', 'collectjs', true, 'x', actor); assert false, 'test before credentials';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable before credentials';
  exception when insufficient_privilege then null; end;

  v := public.kd_processor_save_credentials('nmi', 'AAAA', 'BBBBBBBB', 'CCCCCCCC', 1, array['securityKey'], '{"securityKey":"abcd"}', actor, null);
  assert v = 1, 'first version';
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable without a test';
  exception when insufficient_privilege then null; end;

  -- a failing test does not allow enabling
  perform public.kd_processor_record_test('nmi', 'collectjs', false, 'bad key', actor);
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable after a failed test';
  exception when insufficient_privilege then null; end;
  -- a passing test in another mode does not allow enabling
  perform public.kd_processor_record_test('nmi', 'payment_component', true, 'ok', actor);
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable with a test of another mode';
  exception when insufficient_privilege then null; end;

  perform public.kd_processor_record_test('nmi', 'collectjs', true, 'ok', actor);
  perform public.kd_processor_set_enabled('nmi', true, actor, null);
  assert (select enabled from public.processors where processor_id = 'nmi'), 'enabled after a passing test';

  -- a stale row version is refused
  select version into ver from public.processors where processor_id = 'nmi';
  begin perform public.kd_processor_set_enabled('nmi', false, actor, ver - 1); assert false, 'stale version';
  exception when serialization_failure then null; end;

  -- new credentials disable and invalidate the test
  v := public.kd_processor_save_credentials('nmi', 'DDDD', 'EEEEEEEE', 'FFFFFFFF', 1, array['securityKey'], '{"securityKey":"wxyz"}', actor, null);
  assert v = 2, 'second version';
  assert not (select enabled from public.processors where processor_id = 'nmi'), 'credentials change disables';
  assert (select count(*) from public.processor_credentials where processor_id = 'nmi' and is_current) = 1, 'one current version';
  assert (select count(*) from public.processor_credentials where processor_id = 'nmi') = 2, 'old version kept';
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable with an old test';
  exception when insufficient_privilege then null; end;

  perform public.kd_processor_record_test('nmi', 'collectjs', true, 'ok', actor);
  perform public.kd_processor_set_enabled('nmi', true, actor, null);
  perform public.kd_processor_set_environment('nmi', 'live', actor, null);
  assert not (select enabled from public.processors where processor_id = 'nmi'), 'environment change disables';
  begin perform public.kd_processor_set_enabled('nmi', true, actor, null); assert false, 'enable after environment change';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_processor_set_environment('nmi', 'staging', actor, null); assert false, 'unknown environment';
  exception when invalid_parameter_value then null; end;

  -- mode switch uses the test of the target mode for the current credentials and environment
  begin perform public.kd_processor_switch_mode('nmi', 'payment_component', actor, 24); assert false, 'switch without a test in this environment';
  exception when insufficient_privilege then null; end;
  perform public.kd_processor_record_test('nmi', 'payment_component', true, 'ok', actor);
  tid := public.kd_processor_switch_mode('nmi', 'payment_component', actor, 24);
  assert tid is not null and (select active_mode from public.processors where processor_id = 'nmi') = 'payment_component', 'mode switched';
  assert (select count(*) from public.processor_modes where processor_id = 'nmi' and is_active) = 1, 'still one active mode';
end
$$;
