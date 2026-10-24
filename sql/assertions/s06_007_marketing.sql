-- path: sql/assertions/s06_007_marketing.sql
-- Marketing tables: checks, one lead per address, experiment counting only while running, closed to clients.
do $$
begin
  insert into public.leads (email, source) values ('a@example.com', 'newsletter');
  begin insert into public.leads (email, source) values ('a@example.com', 'contact'); assert false, 'one lead per address';
  exception when unique_violation then null; end;
  begin insert into public.leads (email, source) values ('B@Example.com', 'contact'); assert false, 'lower case address';
  exception when check_violation then null; end;
  begin insert into public.leads (email, source) values ('c@example.com', 'ads'); assert false, 'source checked';
  exception when check_violation then null; end;
  begin insert into public.testimonials (quote, person_name) values ('short', 'Jane Doe'); assert false, 'quote length';
  exception when check_violation then null; end;
  begin insert into public.campaigns (name, subject, body_text, status) values ('Spring', 'Hello there', 'A long enough body text', 'queued'); assert false, 'campaign status';
  exception when check_violation then null; end;
  begin insert into public.ab_experiments (key, name, goal_event, variants) values ('hero-test', 'Hero test', 'signup_click', '[{"key":"a"}]'::jsonb); assert false, 'two variants at least';
  exception when check_violation then null; end;
  insert into public.ab_experiments (key, name, goal_event, variants, status) values ('hero-test', 'Hero test', 'signup_click', '[{"key":"a"},{"key":"b"}]'::jsonb, 'draft');
  assert public.kd_ab_count('hero-test', 'a', 'exposure') = false, 'a draft is not counted';
  update public.ab_experiments set status = 'running' where key = 'hero-test';
  assert public.kd_ab_count('hero-test', 'a', 'exposure') = true, 'running experiment counts';
  assert public.kd_ab_count('hero-test', 'a', 'conversion') = true, 'conversion counts';
  assert public.kd_ab_count('hero-test', 'zzz', 'exposure') = false, 'unknown variant is refused';
  assert (select exposures || '/' || conversions from public.ab_stats where experiment_key = 'hero-test' and variant = 'a') = '1/1', 'counters';
  update public.ab_experiments set winner = 'a' where key = 'hero-test';
  assert public.kd_ab_count('hero-test', 'a', 'exposure') = false, 'a decided experiment stops counting';
  assert not has_table_privilege('authenticated', 'public.leads', 'select'), 'closed to clients';
end
$$;
