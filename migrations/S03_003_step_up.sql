-- path: migrations/S03_003_step_up.sql
-- STEP 03.6 Step-up: the time of the last password plus 2FA re-check is kept on the session record.

alter table public.user_sessions add column if not exists step_up_at timestamptz;
grant select (step_up_at) on public.user_sessions to authenticated;

-- Revoke exactly one session (platform record and, when present, the Supabase Auth session).
create or replace function public.kd_revoke_session(p_session uuid, p_reason text default 'revoked') returns boolean
language plpgsql security definer
set search_path = public
as $$
declare r public.user_sessions;
begin
  update public.user_sessions set revoked_at = now(), revoke_reason = left(p_reason, 100)
  where id = p_session and revoked_at is null returning * into r;
  if not found then
    return false;
  end if;
  if r.auth_session_id is not null and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where id = $1' using r.auth_session_id;
  end if;
  return true;
end
$$;
revoke execute on function public.kd_revoke_session(uuid, text) from public, anon, authenticated;
grant execute on function public.kd_revoke_session(uuid, text) to service_role;
