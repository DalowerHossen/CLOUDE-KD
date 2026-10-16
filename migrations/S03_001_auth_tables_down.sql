-- path: migrations/S03_001_auth_tables_down.sql
drop function if exists public.kd_revoke_user_sessions(uuid, uuid, text);
drop table if exists public.impersonation_sessions;
drop table if exists public.oauth_identities;
drop table if exists public.user_devices;
drop table if exists public.user_sessions;
drop table if exists public.backup_codes;
drop table if exists public.two_factor_factors;
drop table if exists public.password_history;
drop table if exists public.auth_unlock_requests;
drop table if exists public.auth_login_events;
drop table if exists public.auth_login_state;
