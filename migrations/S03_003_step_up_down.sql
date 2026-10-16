-- path: migrations/S03_003_step_up_down.sql
alter table public.user_sessions drop column if exists step_up_at;
drop function if exists public.kd_revoke_session(uuid, text);
