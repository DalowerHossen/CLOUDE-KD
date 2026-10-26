-- path: migrations/S16_031_platform_setup_steps_down.sql
-- Rows of the new steps must go first, otherwise the old check cannot be restored.
delete from public.platform_setup where step_key not in ('approval_mode', 'email', 'security');
alter table public.platform_setup drop constraint if exists platform_setup_step_key_check;
alter table public.platform_setup add constraint platform_setup_step_key_check
  check (step_key in ('approval_mode', 'email', 'security'));
