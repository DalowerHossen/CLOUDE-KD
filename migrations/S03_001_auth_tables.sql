-- path: migrations/S03_001_auth_tables.sql
-- STEP 03.2 Authentication tables. Secrets (TOTP seeds, OAuth tokens) are stored encrypted by the application;
-- passwords of the password history and backup codes are stored as one-way hashes. Writes happen only through the
-- service role; signed-in users can read their own non-secret rows.

create table if not exists public.auth_login_state (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid,
  failure_count integer not null default 0 check (failure_count between 0 and 1000),
  locked_until timestamptz,
  lock_started_at timestamptz,
  lock_reason text check (lock_reason in ('password', 'two_factor', 'mixed')),
  lock_count integer not null default 0 check (lock_count >= 0),
  last_failure_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.auth_login_events (
  -- guard:append-only (history of sign-in activity; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid,
  event_type text not null check (event_type in (
    'login_success', 'login_failed', 'two_factor_success', 'two_factor_failed', 'backup_code_used', 'locked',
    'blocked_while_locked', 'logout', 'logout_all', 'password_changed', 'reset_requested', 'reset_suppressed',
    'reset_completed', 'unlock_requested', 'unlock_confirmed', 'unlock_completed', 'new_device', 'ip_change',
    'oauth_login', 'impersonation_started', 'impersonation_ended', 'signup', 'email_verified')),
  ip_masked text,
  ip_hash text,
  user_agent_hash text,
  device_hash text,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_unlock_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  target_user_id uuid not null,
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  requested_by uuid not null,
  requested_by_role text not null check (requested_by_role in ('super_admin', 'ceo', 'admin_staff')),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'unlocked', 'expired', 'cancelled')),
  confirmation_token_hash text not null check (confirmation_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmed_ip_hash text,
  unlocked_by uuid,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.password_history (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  password_hash text not null check (char_length(password_hash) between 40 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.two_factor_factors (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  factor_type text not null default 'totp' check (factor_type = 'totp'),
  secret_encrypted jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  verified_at timestamptz,
  last_used_step bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.backup_codes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  code_hash text not null check (char_length(code_hash) between 40 and 400),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.user_sessions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  auth_session_id uuid,
  device_hash text,
  ip_masked text,
  ip_hash text,
  user_agent_label text check (char_length(user_agent_label) <= 120),
  aal text not null default 'aal1' check (aal in ('aal1', 'aal2')),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text check (char_length(revoke_reason) <= 100),
  impersonated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.user_devices (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  device_hash text not null check (char_length(device_hash) = 64),
  label text not null default '' check (char_length(label) <= 120),
  last_ip_masked text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.oauth_identities (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null,
  provider text not null check (provider in ('google', 'github')),
  provider_subject text not null check (char_length(provider_subject) between 1 and 200),
  tokens_encrypted jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.impersonation_sessions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  admin_user_id uuid not null,
  target_user_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 1000),
  step_up_at timestamptz not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (expires_at > started_at),
  check (admin_user_id <> target_user_id)
);

do $$
declare t text;
begin
  foreach t in array array['auth_login_state', 'auth_unlock_requests', 'password_history', 'two_factor_factors',
    'backup_codes', 'user_sessions', 'user_devices', 'oauth_identities', 'impersonation_sessions']
  loop
    perform public.apply_standard_triggers(('public.' || t)::regclass);
  end loop;
  foreach t in array array['auth_unlock_requests', 'two_factor_factors', 'oauth_identities', 'impersonation_sessions']
  loop
    perform public.audit_enable_for(('public.' || t)::regclass);
  end loop;
end
$$;

-- Login events are append-only like the audit tables.
drop trigger if exists trg_auth_login_events_immutable on public.auth_login_events;
create trigger trg_auth_login_events_immutable before update or delete on public.auth_login_events
  for each row execute function public.audit_block_change();
drop trigger if exists trg_auth_login_events_no_truncate on public.auth_login_events;
create trigger trg_auth_login_events_no_truncate before truncate on public.auth_login_events
  for each statement execute function public.audit_block_change();

select public.rls_enable_default_deny('public.auth_login_state');
select public.rls_enable_default_deny('public.auth_login_events');
select public.rls_enable_default_deny('public.auth_unlock_requests');
select public.rls_enable_default_deny('public.password_history');
select public.rls_enable_default_deny('public.two_factor_factors');
select public.rls_enable_default_deny('public.backup_codes');
select public.rls_enable_default_deny('public.user_sessions');
select public.rls_enable_default_deny('public.user_devices');
select public.rls_enable_default_deny('public.oauth_identities');
select public.rls_enable_default_deny('public.impersonation_sessions');

create unique index if not exists uq_auth_login_state_identifier on public.auth_login_state (identifier_hash) where deleted_at is null;
create index if not exists ix_auth_login_state_user on public.auth_login_state (user_id) where user_id is not null;
create index if not exists ix_auth_login_state_locked on public.auth_login_state (locked_until) where locked_until is not null;
create index if not exists ix_auth_login_events_identifier on public.auth_login_events (identifier_hash, created_at desc);
create index if not exists ix_auth_login_events_user on public.auth_login_events (user_id, created_at desc);
create index if not exists ix_auth_unlock_user on public.auth_unlock_requests (target_user_id, status);
create unique index if not exists uq_auth_unlock_token on public.auth_unlock_requests (confirmation_token_hash);
create index if not exists ix_password_history_user on public.password_history (user_id, created_at desc);
create unique index if not exists uq_two_factor_active on public.two_factor_factors (user_id) where status in ('pending', 'active') and deleted_at is null;
create index if not exists ix_backup_codes_user on public.backup_codes (user_id) where used_at is null;
create index if not exists ix_user_sessions_user on public.user_sessions (user_id, last_active_at desc);
create unique index if not exists uq_user_sessions_auth on public.user_sessions (auth_session_id) where auth_session_id is not null;
create unique index if not exists uq_user_devices_hash on public.user_devices (user_id, device_hash) where deleted_at is null;
create unique index if not exists uq_oauth_identity on public.oauth_identities (provider, provider_subject) where deleted_at is null;
create unique index if not exists uq_oauth_user_provider on public.oauth_identities (user_id, provider) where deleted_at is null;
create index if not exists ix_impersonation_admin on public.impersonation_sessions (admin_user_id, started_at desc);

-- Access: service role everywhere; signed-in users read only their own non-secret columns. -------------------------------
revoke all on public.auth_login_state, public.auth_login_events, public.auth_unlock_requests, public.password_history,
  public.two_factor_factors, public.backup_codes, public.user_sessions, public.user_devices, public.oauth_identities,
  public.impersonation_sessions from authenticated;
grant all on public.auth_login_state, public.auth_login_events, public.auth_unlock_requests, public.password_history,
  public.two_factor_factors, public.backup_codes, public.user_sessions, public.user_devices, public.oauth_identities,
  public.impersonation_sessions to service_role;

grant select (id, event_type, ip_masked, user_id, created_at) on public.auth_login_events to authenticated;
grant select (id, factor_type, status, verified_at, created_at, user_id) on public.two_factor_factors to authenticated;
grant select (id, user_id, company_id, ip_masked, user_agent_label, aal, last_active_at, expires_at, revoked_at, created_at, impersonated_by) on public.user_sessions to authenticated;
grant select (id, user_id, label, last_ip_masked, first_seen_at, last_seen_at) on public.user_devices to authenticated;
grant select (id, user_id, provider, linked_at) on public.oauth_identities to authenticated;

drop policy if exists login_events_own on public.auth_login_events;
create policy login_events_own on public.auth_login_events for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists two_factor_own on public.two_factor_factors;
create policy two_factor_own on public.two_factor_factors for select to authenticated
  using (deleted_at is null and user_id = (select auth.uid()));
drop policy if exists sessions_own_or_owner on public.user_sessions;
create policy sessions_own_or_owner on public.user_sessions for select to authenticated
  using (deleted_at is null and (user_id = (select auth.uid())
    or (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner')));
drop policy if exists devices_own on public.user_devices;
create policy devices_own on public.user_devices for select to authenticated
  using (deleted_at is null and user_id = (select auth.uid()));
drop policy if exists oauth_own on public.oauth_identities;
create policy oauth_own on public.oauth_identities for select to authenticated
  using (deleted_at is null and user_id = (select auth.uid()));

-- Revoke sessions at the auth server (Supabase keeps its own session table). No-op on a plain PostgreSQL database.
create or replace function public.kd_revoke_user_sessions(p_user uuid, p_except uuid default null, p_reason text default 'revoked')
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.user_sessions set revoked_at = now(), revoke_reason = left(p_reason, 100)
  where user_id = p_user and revoked_at is null and (p_except is null or auth_session_id is distinct from p_except);
  get diagnostics n = row_count;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1 and ($2::uuid is null or id <> $2)' using p_user, p_except;
  end if;
  return n;
end
$$;
revoke execute on function public.kd_revoke_user_sessions(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_revoke_user_sessions(uuid, uuid, text) to service_role;
