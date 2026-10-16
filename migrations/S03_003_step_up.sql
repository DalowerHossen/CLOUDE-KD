-- path: migrations/S03_003_step_up.sql
-- STEP 03.6 Step-up: the time of the last password plus 2FA re-check is kept on the session record.

alter table public.user_sessions add column if not exists step_up_at timestamptz;
grant select (step_up_at) on public.user_sessions to authenticated;
