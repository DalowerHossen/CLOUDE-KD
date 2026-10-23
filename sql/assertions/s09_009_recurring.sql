-- path: sql/assertions/s09_009_recurring.sql
-- Recurring schedules: an occurrence is claimed once, a claimed run is not claimed again until it is stale, a failed
-- run can be claimed again, completion moves the schedule on, and too many failures pause it.
do $$
declare
  c uuid; cl uuid; s uuid; inv uuid; r record; r2 record; paused boolean;
begin
  insert into public.companies (name, slug) values ('Rec Co', 'rec-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.recurring_schedules (company_id, client_id, name, template, unit, every, start_date, next_run_date, created_by)
    values (c, cl, 'Monthly', '{}', 'month', 1, current_date - 3, current_date - 3, gen_random_uuid()) returning id into s;
  begin insert into public.recurring_schedules (company_id, client_id, name, template, unit, every, start_date, created_by) values (c, cl, 'Bad', '{}', 'decade', 1, current_date, gen_random_uuid()); assert false, 'known units';
  exception when check_violation then null; end;
  begin insert into public.recurring_schedules (company_id, client_id, name, template, unit, every, start_date, end_date, created_by) values (c, cl, 'Bad', '{}', 'month', 1, current_date, current_date - 1, gen_random_uuid()); assert false, 'end after start';
  exception when check_violation then null; end;

  select * into r from public.kd_recurring_claim(s, current_date);
  assert r.run_id is not null and r.occurrence_index = 0 and r.run_date = current_date - 3, 'first claim';
  select * into r2 from public.kd_recurring_claim(s, current_date);
  assert r2.run_id is null, 'a claimed run is not claimed twice';

  -- a failure lets the next worker claim it again
  paused := public.kd_recurring_fail(r.run_id, 'no tax rate', 3);
  assert not paused, 'not paused after one failure';
  select * into r2 from public.kd_recurring_claim(s, current_date);
  assert r2.run_id = r.run_id, 'the same run is claimed again after a failure';
  assert (select attempts from public.recurring_runs where id = r.run_id) = 2;

  -- completion moves the schedule on
  insert into public.invoices (company_id, client_id, recurring_run_id) values (c, cl, r.run_id) returning id into inv;
  begin insert into public.invoices (company_id, client_id, recurring_run_id) values (c, cl, r.run_id); assert false, 'one invoice per run';
  exception when unique_violation then null; end;
  perform public.kd_recurring_complete(r.run_id, inv, current_date + 27, '');
  assert (select occurrences_done from public.recurring_schedules where id = s) = 1, 'counter moved';
  assert (select next_run_date from public.recurring_schedules where id = s) = current_date + 27, 'next date';
  assert (select failure_count from public.recurring_schedules where id = s) = 0, 'failures reset';
  perform public.kd_recurring_complete(r.run_id, inv, current_date + 99, '');
  assert (select next_run_date from public.recurring_schedules where id = s) = current_date + 27, 'completing twice changes nothing';
  select * into r2 from public.kd_recurring_claim(s, current_date);
  assert r2.run_id is null, 'not due yet';

  -- the last run ends the schedule
  update public.recurring_schedules set next_run_date = current_date where id = s;
  select * into r from public.kd_recurring_claim(s, current_date);
  assert r.occurrence_index = 1, 'second occurrence';
  perform public.kd_recurring_complete(r.run_id, null, null, '');
  assert (select status from public.recurring_schedules where id = s) = 'ended', 'ends when there is no next date';
  select * into r2 from public.kd_recurring_claim(s, current_date + 400);
  assert r2.run_id is null, 'an ended schedule is not claimed';

  -- three failures pause it
  insert into public.recurring_schedules (company_id, client_id, name, template, unit, every, start_date, next_run_date, created_by)
    values (c, cl, 'Flaky', '{}', 'week', 1, current_date, current_date, gen_random_uuid()) returning id into s;
  for i in 1..3 loop
    select * into r from public.kd_recurring_claim(s, current_date);
    paused := public.kd_recurring_fail(r.run_id, 'boom', 3);
  end loop;
  assert paused and (select status from public.recurring_schedules where id = s) = 'paused', 'paused after three failures';
end
$$;
