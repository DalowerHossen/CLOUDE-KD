-- path: sql/assertions/s07_008_admin_ops.sql
-- Shifts: valid minutes, no overlap, replace is atomic; announcements need an end after the start; one row per setup step.
do $$
declare
  u uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users (id, email) values (u, 'shift-' || u || '@example.test');
  begin insert into public.admin_shifts (user_id, weekday, start_minute, end_minute) values (u, 7, 0, 60); assert false, 'weekday range';
  exception when check_violation then null; end;
  begin insert into public.admin_shifts (user_id, weekday, start_minute, end_minute) values (u, 1, 600, 600); assert false, 'end after start';
  exception when check_violation then null; end;
  n := public.kd_admin_shifts_replace(u, '[{"weekday":1,"start":540,"end":1020},{"weekday":2,"start":540,"end":1020}]'::jsonb);
  assert n = 2, 'two slots saved';
  begin perform public.kd_admin_shifts_replace(u, '[{"weekday":1,"start":540,"end":700},{"weekday":1,"start":600,"end":800}]'::jsonb); assert false, 'overlap refused';
  exception when sqlstate '22023' then null; end;
  assert (select count(*) from public.admin_shifts where user_id = u and deleted_at is null) = 2, 'a refused replace keeps the earlier plan';
  n := public.kd_admin_shifts_replace(u, '[]'::jsonb);
  assert (select count(*) from public.admin_shifts where user_id = u and deleted_at is null) = 0, 'cleared';
  begin insert into public.announcements (title, body, starts_at, ends_at, created_by) values ('T', 'B', now(), now() - interval '1 hour', u); assert false, 'ends after start';
  exception when check_violation then null; end;
  begin insert into public.announcements (title, body, kind, ends_at, created_by) values ('T', 'B', 'sale', now() + interval '1 day', u); assert false, 'known kinds';
  exception when check_violation then null; end;
  insert into public.announcements (title, body, ends_at, created_by) values ('Planned work', 'Short break tonight.', now() + interval '1 day', u);
  insert into public.platform_setup (step_key, completed_by) values ('email', u);
  begin insert into public.platform_setup (step_key, completed_by) values ('email', u); assert false, 'one row per step';
  exception when unique_violation then null; end;
  begin insert into public.platform_setup (step_key, completed_by) values ('payments', u); assert false, 'known steps';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.announcements', 'select'), 'closed to clients';
end
$$;
