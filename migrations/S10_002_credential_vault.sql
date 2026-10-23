-- path: migrations/S10_002_credential_vault.sql
-- STEP 10.3 Credential vault and processor state functions. All state changes of a processor go through these functions
-- so the rules hold even if a caller is careless:
--   saving credentials makes a new version and disables the processor until a new test passes;
--   a processor is enabled only when its latest test passed for the current credentials, mode and environment;
--   changing the environment disables it as well.
-- Every function takes an optional expected row version (optimistic locking) and raises 40001 when it is stale.

create or replace function public.kd_processor_ensure(p_processor text, p_modes jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  m jsonb;
  has_active boolean;
begin
  insert into public.processors (processor_id) values (p_processor)
    on conflict (processor_id) where deleted_at is null do nothing;
  select id into pid from public.processors where processor_id = p_processor and deleted_at is null;
  for m in select * from jsonb_array_elements(p_modes) loop
    insert into public.processor_modes (processor_id, mode_id, label)
      values (p_processor, m ->> 'id', m ->> 'label')
      on conflict (processor_id, mode_id) where deleted_at is null do nothing;
  end loop;
  select exists (select 1 from public.processor_modes where processor_id = p_processor and is_active and deleted_at is null) into has_active;
  if not has_active then
    update public.processor_modes set is_active = true
      where processor_id = p_processor and deleted_at is null
        and mode_id = coalesce((select x ->> 'id' from jsonb_array_elements(p_modes) x where (x ->> 'isDefault')::boolean limit 1),
                               (select mode_id from public.processor_modes where processor_id = p_processor and deleted_at is null order by created_at limit 1));
    update public.processors set active_mode = (select mode_id from public.processor_modes where processor_id = p_processor and is_active and deleted_at is null)
      where id = pid;
  end if;
  return pid;
end
$$;

create or replace function public.kd_processor_save_credentials(
  p_processor text, p_ciphertext text, p_iv text, p_tag text, p_key_version integer,
  p_field_keys text[], p_last_chars jsonb, p_by uuid, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  proc record;
  next_version integer;
begin
  select * into proc from public.processors where processor_id = p_processor and deleted_at is null for update;
  if not found then raise exception 'unknown processor' using errcode = 'P0002'; end if;
  if p_expected_version is not null and proc.version <> p_expected_version then
    raise exception 'the processor was changed by someone else' using errcode = '40001';
  end if;
  next_version := proc.credentials_version + 1;
  update public.processor_credentials set is_current = false where processor_id = p_processor and is_current;
  insert into public.processor_credentials (processor_id, credentials_version, ciphertext, iv, tag, key_version, field_keys, last_chars, is_current, updated_by)
    values (p_processor, next_version, p_ciphertext, p_iv, p_tag, p_key_version, p_field_keys, p_last_chars, true, p_by);
  update public.processors
    set credentials_version = next_version, enabled = false,
        disabled_reason = case when proc.credentials_version = 0 then 'credentials saved, test the connection' else 'credentials changed, test again' end,
        last_test_ok = null, last_test_version = null, last_test_mode = null, last_test_environment = null, updated_by = p_by
    where id = proc.id;
  return next_version;
end
$$;

create or replace function public.kd_processor_record_test(p_processor text, p_mode text, p_ok boolean, p_message text, p_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  proc record;
  tid uuid;
begin
  select * into proc from public.processors where processor_id = p_processor and deleted_at is null for update;
  if not found then raise exception 'unknown processor' using errcode = 'P0002'; end if;
  if proc.credentials_version = 0 then raise exception 'save credentials before testing' using errcode = '42501'; end if;
  if not exists (select 1 from public.processor_modes where processor_id = p_processor and mode_id = p_mode and deleted_at is null) then
    raise exception 'unknown mode' using errcode = 'P0002';
  end if;
  insert into public.processor_mode_tests (processor_id, mode_id, environment, credentials_version, ok, message, tested_by)
    values (p_processor, p_mode, proc.environment, proc.credentials_version, p_ok, left(coalesce(p_message, ''), 300), p_by)
    returning id into tid;
  if p_mode = proc.active_mode then
    update public.processors
      set last_test_at = now(), last_test_ok = p_ok, last_test_version = proc.credentials_version,
          last_test_mode = p_mode, last_test_environment = proc.environment,
          enabled = case when p_ok then enabled else false end,
          disabled_reason = case when p_ok then disabled_reason else 'the last test failed' end,
          updated_by = p_by
      where id = proc.id;
  end if;
  return tid;
end
$$;

create or replace function public.kd_processor_set_enabled(p_processor text, p_enabled boolean, p_by uuid, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proc record;
begin
  select * into proc from public.processors where processor_id = p_processor and deleted_at is null for update;
  if not found then raise exception 'unknown processor' using errcode = 'P0002'; end if;
  if p_expected_version is not null and proc.version <> p_expected_version then
    raise exception 'the processor was changed by someone else' using errcode = '40001';
  end if;
  if p_enabled then
    if proc.credentials_version = 0 then raise exception 'save credentials first' using errcode = '42501'; end if;
    if proc.last_test_ok is not true or proc.last_test_version is distinct from proc.credentials_version
       or proc.last_test_mode is distinct from proc.active_mode or proc.last_test_environment is distinct from proc.environment then
      raise exception 'a passing test for the current credentials, mode and environment is required' using errcode = '42501';
    end if;
    update public.processors set enabled = true, disabled_reason = null, updated_by = p_by where id = proc.id;
  else
    update public.processors set enabled = false, disabled_reason = 'disabled by an administrator', updated_by = p_by where id = proc.id;
  end if;
end
$$;

create or replace function public.kd_processor_set_environment(p_processor text, p_environment text, p_by uuid, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proc record;
begin
  if p_environment not in ('sandbox', 'live') then raise exception 'unknown environment' using errcode = '22023'; end if;
  select * into proc from public.processors where processor_id = p_processor and deleted_at is null for update;
  if not found then raise exception 'unknown processor' using errcode = 'P0002'; end if;
  if p_expected_version is not null and proc.version <> p_expected_version then
    raise exception 'the processor was changed by someone else' using errcode = '40001';
  end if;
  if proc.environment = p_environment then return; end if;
  update public.processors
    set environment = p_environment, enabled = false, disabled_reason = 'environment changed, test again',
        last_test_ok = null, last_test_version = null, last_test_mode = null, last_test_environment = null, updated_by = p_by
    where id = proc.id;
end
$$;

revoke all on function public.kd_processor_ensure(text, jsonb) from public, anon, authenticated;
revoke all on function public.kd_processor_save_credentials(text, text, text, text, integer, text[], jsonb, uuid, integer) from public, anon, authenticated;
revoke all on function public.kd_processor_record_test(text, text, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.kd_processor_set_enabled(text, boolean, uuid, integer) from public, anon, authenticated;
revoke all on function public.kd_processor_set_environment(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.kd_processor_ensure(text, jsonb) to service_role;
grant execute on function public.kd_processor_save_credentials(text, text, text, text, integer, text[], jsonb, uuid, integer) to service_role;
grant execute on function public.kd_processor_record_test(text, text, boolean, text, uuid) to service_role;
grant execute on function public.kd_processor_set_enabled(text, boolean, uuid, integer) to service_role;
grant execute on function public.kd_processor_set_environment(text, text, uuid, integer) to service_role;
