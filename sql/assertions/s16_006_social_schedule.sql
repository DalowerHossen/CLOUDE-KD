-- path: sql/assertions/s16_006_social_schedule.sql
-- Social schedules, rules, evergreen queue, approval, link tracking and statistics: RLS on; a post moves through approval in the
-- allowed ways only and is not published while approval is pending or refused; changing an approved post cancels the approval; a
-- schedule slot is made once; approval history does not change; rows must belong to the company of what they point to; a rule is
-- handled once per source; a click counts on the link and in the hour and an unknown code gives nothing.
do $$
declare
  c uuid; d uuid; a uuid; ad uuid; g uuid; p uuid; s uuid; r uuid; l uuid; n integer; t text; slot timestamptz := date_trunc('hour', now()) + interval '2 days';
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('social_settings', 'social_post_approvals', 'social_schedules', 'social_rules', 'social_rule_runs',
      'social_evergreen_items', 'social_evergreen_plans', 'social_links', 'social_link_hours', 'social_post_stats') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Sched Co', 'sched-co') returning id into c;
  insert into public.companies (name, slug) values ('Sched Other', 'sched-other') returning id into d;
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (c, 'facebook', 'Page', '7001', enc, 'abcd') returning id into a;
  insert into public.social_accounts (company_id, provider, display_name, external_id, access_token_enc, token_last4) values (d, 'facebook', 'Other', '7002', enc, 'abcd') returning id into ad;
  begin update public.social_accounts set max_posts_per_day = 0 where id = a; assert false, 'daily limit from 1';
  exception when check_violation then null; end;
  update public.social_accounts set max_posts_per_day = 3 where id = a;

  -- settings: one row per company, hours between 1 and 168
  insert into public.social_settings (company_id, approval_required, approval_sla_hours) values (c, true, 24);
  begin insert into public.social_settings (company_id) values (c); assert false, 'one settings row';
  exception when unique_violation then null; end;
  begin insert into public.social_settings (company_id, approval_sla_hours) values (d, 0); assert false, 'hours from 1';
  exception when check_violation then null; end;

  -- approval of a post
  insert into public.social_posts (company_id, account_id, body) values (c, a, 'Needs a look') returning id into p;
  update public.social_posts set approval_status = 'pending', approval_requested_at = now() where id = p;
  begin update public.social_posts set status = 'publishing', container_id = 'c1', publish_after = now() where id = p; assert false, 'not published while pending';
  exception when object_not_in_prerequisite_state then null; end;
  update public.social_posts set approval_status = 'rejected', approval_decided_at = now(), approval_reason = 'Not now' where id = p;
  begin update public.social_posts set status = 'publishing', container_id = 'c1', publish_after = now() where id = p; assert false, 'not published when refused';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.social_posts set approval_status = 'approved' where id = p; assert false, 'refused cannot jump to approved';
  exception when object_not_in_prerequisite_state then null; end;
  update public.social_posts set approval_status = 'pending', approval_requested_at = now() where id = p;
  update public.social_posts set approval_status = 'approved', approval_decided_at = now() where id = p;
  begin update public.social_posts set body = 'Changed after approval' where id = p; assert false, 'approved then changed needs new approval';
  exception when object_not_in_prerequisite_state then null; end;
  update public.social_posts set body = 'Changed after approval', approval_status = 'pending', approval_requested_at = now() where id = p;
  begin update public.social_posts set approval_status = 'bogus' where id = p; assert false, 'approval value list';
  exception when check_violation or object_not_in_prerequisite_state then null; end;

  -- approval history is append only and belongs to the company of the post
  insert into public.social_post_approvals (company_id, post_id, event, actor_id) values (c, p, 'submitted', null);
  begin insert into public.social_post_approvals (company_id, post_id, event) values (d, p, 'submitted'); assert false, 'history of another company';
  exception when no_data_found then null; end;
  begin update public.social_post_approvals set event = 'approved' where post_id = p; assert false, 'history does not change';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.social_post_approvals (company_id, post_id, event) values (c, p, 'maybe'); assert false, 'event list';
  exception when check_violation then null; end;

  -- schedules
  insert into public.social_hashtag_groups (company_id, name, tags) values (c, 'Sched', array['#a']) returning id into g;
  insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone, hashtag_group_id)
    values (c, a, 'Weekdays', 'Good morning', array[1,2,3,4,5]::smallint[], '09:30', 'Asia/Dhaka', g) returning id into s;
  begin insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone) values (c, a, 'Bad day', 'x', array[7]::smallint[], '09:30', 'UTC'); assert false, 'day 0 to 6';
  exception when check_violation then null; end;
  begin insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone) values (c, a, 'No days', 'x', array[]::smallint[], '09:30', 'UTC'); assert false, 'a day needed';
  exception when check_violation then null; end;
  begin insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone) values (c, a, 'Bad time', 'x', array[1]::smallint[], '25:00', 'UTC'); assert false, 'time of day';
  exception when check_violation then null; end;
  begin insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone) values (c, a, 'Empty', '', array[1]::smallint[], '09:00', 'UTC'); assert false, 'text or image';
  exception when check_violation then null; end;
  begin insert into public.social_schedules (company_id, account_id, name, body, days_of_week, time_of_day, timezone) values (c, ad, 'Other account', 'x', array[1]::smallint[], '09:00', 'UTC'); assert false, 'account of another company';
  exception when no_data_found then null; end;

  insert into public.social_posts (company_id, account_id, body, status, scheduled_at, schedule_id, schedule_slot) values (c, a, 'Slot', 'scheduled', slot, s, slot);
  begin insert into public.social_posts (company_id, account_id, body, status, scheduled_at, schedule_id, schedule_slot) values (c, a, 'Slot again', 'scheduled', slot, s, slot); assert false, 'a slot is made once';
  exception when unique_violation then null; end;

  -- rules
  insert into public.social_rules (company_id, name, trigger_key, account_ids, body_template) values (c, 'On launch', 'launch.ready', array[a], 'New: {title} {url}') returning id into r;
  select enabled::text || dry_run::text || mode into t from public.social_rules where id = r;
  assert t = 'falsetruedraft', 'a rule starts off, as a dry run, making drafts';
  begin insert into public.social_rules (company_id, name, trigger_key, account_ids, body_template) values (c, 'Bad key', 'Launch Ready', array[a], 'x'); assert false, 'trigger key shape';
  exception when check_violation then null; end;
  begin insert into public.social_rules (company_id, name, trigger_key, account_ids, body_template) values (c, 'Foreign', 'launch.two', array[ad], 'x'); assert false, 'rule accounts of the company';
  exception when no_data_found then null; end;
  begin insert into public.social_rules (company_id, name, trigger_key, account_ids, body_template) values (c, 'Nobody', 'launch.three', array[]::uuid[], 'x'); assert false, 'an account needed';
  exception when check_violation then null; end;
  insert into public.social_rule_runs (company_id, rule_id, source_key, status, rendered_text) values (c, r, 'blog-1', 'dry_run', 'New: A https://x.test');
  begin insert into public.social_rule_runs (company_id, rule_id, source_key, status) values (c, r, 'blog-1', 'created'); assert false, 'a source is handled once';
  exception when unique_violation then null; end;
  begin insert into public.social_rule_runs (company_id, rule_id, source_key, status) values (d, r, 'blog-2', 'created'); assert false, 'run of another company';
  exception when no_data_found then null; end;

  -- evergreen
  insert into public.social_evergreen_items (company_id, account_id, name, variants) values (c, a, 'Tip', array['One', 'Two']);
  begin insert into public.social_evergreen_items (company_id, account_id, name, variants) values (c, a, 'None', array[]::text[]); assert false, 'a variant needed';
  exception when check_violation then null; end;
  begin insert into public.social_evergreen_items (company_id, account_id, name, variants, priority) values (c, a, 'Prio', array['x'], 6); assert false, 'priority 1 to 5';
  exception when check_violation then null; end;
  insert into public.social_evergreen_plans (company_id, account_id, every_days, time_of_day, timezone) values (c, a, 3, '10:00', 'Asia/Dhaka');
  begin insert into public.social_evergreen_plans (company_id, account_id, every_days, time_of_day, timezone) values (c, a, 2, '10:00', 'UTC'); assert false, 'one plan per account';
  exception when unique_violation then null; end;

  -- links and clicks
  insert into public.social_links (company_id, post_id, code, target_url) values (c, p, 'AbCdEf1234', 'https://shop.example.test/a') returning id into l;
  begin insert into public.social_links (company_id, post_id, code, target_url) values (c, p, 'AbCdEf1234', 'https://shop.example.test/b'); assert false, 'code once';
  exception when unique_violation then null; end;
  begin insert into public.social_links (company_id, post_id, code, target_url) values (c, p, 'short', 'https://shop.example.test/b'); assert false, 'code of ten characters';
  exception when check_violation then null; end;
  begin insert into public.social_links (company_id, post_id, code, target_url) values (c, p, 'ZzZzZzZz12', 'http://shop.example.test/b'); assert false, 'https only';
  exception when check_violation then null; end;
  begin insert into public.social_links (company_id, post_id, code, target_url) values (d, p, 'QqQqQqQq12', 'https://shop.example.test/b'); assert false, 'link of another company';
  exception when no_data_found then null; end;
  assert public.kd_social_click('AbCdEf1234') = 'https://shop.example.test/a', 'a click returns the target';
  perform public.kd_social_click('AbCdEf1234');
  assert public.kd_social_click('NoSuchCode1') is null, 'unknown code gives nothing';
  select clicks into n from public.social_links where id = l;
  assert n = 2, 'clicks counted on the link';
  select sum(clicks) into n from public.social_link_hours where link_id = l;
  assert n = 2, 'clicks counted in the hour';
  select count(*) into n from public.social_link_hours where link_id = l;
  assert n = 1, 'one bucket per hour';

  -- statistics
  insert into public.social_post_stats (company_id, post_id, metrics) values (c, p, '{"views": 10}');
  begin insert into public.social_post_stats (company_id, post_id, metrics) values (c, p, '{"views": 11}'); assert false, 'one stats row per post';
  exception when unique_violation then null; end;
  begin insert into public.social_post_stats (company_id, post_id, metrics) values (c, p, '[1]'); assert false, 'object only';
  exception when unique_violation or check_violation then null; end;
end
$$;
