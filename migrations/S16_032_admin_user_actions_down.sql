-- path: migrations/S16_032_admin_user_actions_down.sql
-- Rows of the new actions must go first, otherwise the old check cannot be restored.
drop function if exists public.kd_user_purge(uuid, uuid);
drop table if exists public.user_deletions;
delete from public.admin_actions where action not in ('user.suspend', 'user.reactivate', 'tenant.suspend', 'tenant.reactivate');
alter table public.admin_actions drop column if exists params;
alter table public.admin_actions drop constraint if exists admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('user.suspend', 'user.reactivate', 'tenant.suspend', 'tenant.reactivate'));
