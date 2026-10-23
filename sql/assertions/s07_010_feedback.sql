-- path: sql/assertions/s07_010_feedback.sql
-- NPS needs a score of 0 to 10; free feedback needs text; the prompt state keeps one row per person.
do $$
declare
  c uuid; u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (u, 'nps-' || u || '@example.test');
  insert into public.companies (name, slug) values ('Feedback Co', 'feedback-co') returning id into c;
  begin insert into public.feedback_entries (company_id, user_id, kind) values (c, u, 'nps'); assert false, 'nps needs a score';
  exception when check_violation then null; end;
  begin insert into public.feedback_entries (company_id, user_id, kind, score) values (c, u, 'nps', 11); assert false, 'score range';
  exception when check_violation then null; end;
  begin insert into public.feedback_entries (company_id, user_id, kind, comment) values (c, u, 'feedback', ''); assert false, 'feedback needs text';
  exception when check_violation then null; end;
  insert into public.feedback_entries (company_id, user_id, kind, score, comment) values (c, u, 'nps', 9, 'Great');
  perform public.kd_feedback_dismissed(c, u, 30);
  perform public.kd_feedback_answered(c, u);
  perform public.kd_feedback_answered(c, u);
  assert (select count(*) from public.feedback_prompts where user_id = u) = 1, 'one state row per person';
  assert (select answered_count from public.feedback_prompts where user_id = u) = 2, 'counted';
  assert (select dismissed_until from public.feedback_prompts where user_id = u) is not null, 'dismissal kept';
  assert not has_table_privilege('authenticated', 'public.feedback_entries', 'select'), 'closed to clients';
end
$$;
