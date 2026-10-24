-- path: migrations/S03_002_lock_engine_down.sql
drop function if exists public.kd_auth_mfa_hook(jsonb);
drop function if exists public.kd_auth_password_hook(jsonb);
drop function if exists public.kd_auth_access_token_hook(jsonb);
drop function if exists public.kd_ip_failures(text, integer);
drop function if exists public.kd_reset_token_consume(text, text);
drop function if exists public.kd_reset_token_issue(text, uuid, text, integer);
drop function if exists public.kd_lock_unlock(text);
drop function if exists public.kd_lock_record_success(text, uuid, uuid);
drop function if exists public.kd_lock_record_failure(text, uuid, uuid, text, integer, integer);
drop function if exists public.kd_lock_check(text);
alter table public.auth_login_state drop column if exists reset_expires_at;
alter table public.auth_login_state drop column if exists reset_token_hash;
alter table public.auth_login_state drop column if exists last_failure_kind;
