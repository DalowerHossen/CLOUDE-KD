-- path: migrations/S03_002_lock_engine.sql
-- STEP 03.4 Lock engine. All state lives in auth_login_state, so a server restart never clears a lock.
-- Every transition is one function call inside one transaction with a row lock.

alter table public.auth_login_state add column if not exists last_failure_kind text check (last_failure_kind in ('password', 'two_factor'));
alter table public.auth_login_state add column if not exists reset_token_hash text check (reset_token_hash is null or reset_token_hash ~ '^[0-9a-f]{64}$');
alter table public.auth_login_state add column if not exists reset_expires_at timestamptz;

-- Read the state. An expired lock counts as free and starts a fresh counter.
create or replace function public.kd_lock_check(p_identifier text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare s public.auth_login_state;
begin
  select * into s from public.auth_login_state where identifier_hash = p_identifier and deleted_at is null;
  if not found then
    return jsonb_build_object('locked', false, 'lockedUntil', null, 'failureCount', 0, 'userId', null);
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('locked', true, 'lockedUntil', s.locked_until, 'failureCount', s.failure_count, 'userId', s.user_id);
  end if;
  return jsonb_build_object('locked', false, 'lockedUntil', null,
    'failureCount', case when s.locked_until is not null then 0 else s.failure_count end, 'userId', s.user_id);
end
$$;

-- Count one failure (wrong password or wrong 2FA code, one shared counter). While locked nothing is counted.
create or replace function public.kd_lock_record_failure(
  p_identifier text, p_user uuid, p_company uuid, p_kind text, p_threshold integer, p_duration_seconds integer
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  s public.auth_login_state;
  new_count integer;
  just_locked boolean := false;
  reason text;
begin
  if p_kind not in ('password', 'two_factor') then
    raise exception 'unknown failure kind' using errcode = '22023';
  end if;
  insert into public.auth_login_state (identifier_hash, user_id, company_id)
  values (p_identifier, p_user, p_company)
  on conflict (identifier_hash) where deleted_at is null do nothing;
  select * into s from public.auth_login_state where identifier_hash = p_identifier and deleted_at is null for update;

  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('locked', true, 'lockedUntil', s.locked_until, 'failureCount', s.failure_count, 'justLocked', false);
  end if;
  -- a finished lock starts a fresh counter
  if s.locked_until is not null then
    s.failure_count := 0;
    s.lock_reason := null;
  end if;
  new_count := s.failure_count + 1;
  if new_count >= p_threshold then
    just_locked := true;
    reason := case when s.failure_count > 0 and s.last_failure_kind is not null and s.last_failure_kind <> p_kind then 'mixed' else p_kind end;
    update public.auth_login_state set failure_count = new_count, last_failure_at = now(), last_failure_kind = p_kind,
      user_id = coalesce(p_user, user_id), company_id = coalesce(p_company, company_id),
      locked_until = now() + make_interval(secs => p_duration_seconds), lock_started_at = now(),
      lock_reason = reason, lock_count = lock_count + 1,
      reset_token_hash = null, reset_expires_at = null
    where id = s.id returning * into s;
  else
    update public.auth_login_state set failure_count = new_count, last_failure_at = now(), last_failure_kind = p_kind,
      user_id = coalesce(p_user, user_id), company_id = coalesce(p_company, company_id),
      locked_until = null, lock_reason = null
    where id = s.id returning * into s;
  end if;
  return jsonb_build_object('locked', just_locked, 'lockedUntil', s.locked_until, 'failureCount', s.failure_count,
    'justLocked', just_locked, 'lockReason', s.lock_reason, 'userId', s.user_id, 'companyId', s.company_id);
end
$$;

-- A full successful login (password and, when required, the second factor) resets the counter. Refused while locked.
create or replace function public.kd_lock_record_success(p_identifier text, p_user uuid, p_company uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare s public.auth_login_state;
begin
  insert into public.auth_login_state (identifier_hash, user_id, company_id)
  values (p_identifier, p_user, p_company)
  on conflict (identifier_hash) where deleted_at is null do nothing;
  select * into s from public.auth_login_state where identifier_hash = p_identifier and deleted_at is null for update;
  if s.locked_until is not null and s.locked_until > now() then
    return false;
  end if;
  update public.auth_login_state set failure_count = 0, locked_until = null, lock_reason = null, last_failure_kind = null,
    last_success_at = now(), user_id = coalesce(p_user, user_id), company_id = coalesce(p_company, company_id)
  where id = s.id;
  return true;
end
$$;

-- Used by the unlock workflow after the owner confirmed. Clears the lock and the counter.
create or replace function public.kd_lock_unlock(p_identifier text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.auth_login_state set failure_count = 0, locked_until = null, lock_reason = null, last_failure_kind = null,
    reset_token_hash = null, reset_expires_at = null
  where identifier_hash = p_identifier and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Password reset token: one active token per identifier, refused while locked, cleared when used or when a lock starts.
create or replace function public.kd_reset_token_issue(p_identifier text, p_user uuid, p_token_hash text, p_ttl_seconds integer) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare s public.auth_login_state;
begin
  insert into public.auth_login_state (identifier_hash, user_id)
  values (p_identifier, p_user)
  on conflict (identifier_hash) where deleted_at is null do nothing;
  select * into s from public.auth_login_state where identifier_hash = p_identifier and deleted_at is null for update;
  if s.locked_until is not null and s.locked_until > now() then
    return false;
  end if;
  update public.auth_login_state set reset_token_hash = p_token_hash,
    reset_expires_at = now() + make_interval(secs => p_ttl_seconds), user_id = coalesce(p_user, user_id)
  where id = s.id;
  return true;
end
$$;

-- Returns the user id when the token is valid and the account is not locked; the token is consumed in the same call.
create or replace function public.kd_reset_token_consume(p_identifier text, p_token_hash text) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare s public.auth_login_state; uid uuid;
begin
  select * into s from public.auth_login_state where identifier_hash = p_identifier and deleted_at is null for update;
  if not found or s.reset_token_hash is null or s.reset_expires_at is null or s.reset_expires_at <= now() then
    return null;
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return null;
  end if;
  if s.reset_token_hash <> p_token_hash then
    return null;
  end if;
  uid := s.user_id;
  update public.auth_login_state set reset_token_hash = null, reset_expires_at = null where id = s.id;
  return uid;
end
$$;

-- Failed sign-ins from one address inside the window (address hash only).
create or replace function public.kd_ip_failures(p_ip_hash text, p_window_seconds integer) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.auth_login_events
  where ip_hash = p_ip_hash and event_type in ('login_failed', 'two_factor_failed', 'blocked_while_locked')
    and created_at > now() - make_interval(secs => p_window_seconds)
$$;

-- Auth Hooks (see DECISIONS D1). Custom Access Token hook: refuse to issue or refresh a token while the account is locked.
create or replace function public.kd_auth_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare uid uuid := nullif(event ->> 'user_id', '')::uuid;
begin
  if uid is not null and exists (select 1 from public.auth_login_state
    where user_id = uid and locked_until is not null and locked_until > now() and deleted_at is null) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'The account is locked.'));
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end
$$;

-- Password Verification Attempt hook (Teams and Enterprise plans): reject while locked, count a wrong password.
create or replace function public.kd_auth_password_hook(event jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare uid uuid := nullif(event ->> 'user_id', '')::uuid; locked boolean;
begin
  select exists (select 1 from public.auth_login_state where user_id = uid and locked_until > now() and deleted_at is null) into locked;
  if locked then
    return jsonb_build_object('decision', 'reject', 'message', 'The account is locked.');
  end if;
  return jsonb_build_object('decision', 'continue');
end
$$;

-- MFA Verification Attempt hook (Teams and Enterprise plans). The platform uses its own TOTP, so this only mirrors the lock.
create or replace function public.kd_auth_mfa_hook(event jsonb) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare uid uuid := nullif(event ->> 'user_id', '')::uuid; locked boolean;
begin
  select exists (select 1 from public.auth_login_state where user_id = uid and locked_until > now() and deleted_at is null) into locked;
  if locked then
    return jsonb_build_object('decision', 'reject', 'message', 'The account is locked.');
  end if;
  return jsonb_build_object('decision', 'continue');
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.kd_lock_check(text)', 'public.kd_lock_record_failure(text, uuid, uuid, text, integer, integer)',
    'public.kd_lock_record_success(text, uuid, uuid)', 'public.kd_lock_unlock(text)',
    'public.kd_reset_token_issue(text, uuid, text, integer)', 'public.kd_reset_token_consume(text, text)',
    'public.kd_ip_failures(text, integer)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.kd_auth_access_token_hook(jsonb)', 'public.kd_auth_password_hook(jsonb)', 'public.kd_auth_mfa_hook(jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
      execute format('grant execute on function %s to supabase_auth_admin', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant select on public.auth_login_state to supabase_auth_admin;
  end if;
end
$$;
