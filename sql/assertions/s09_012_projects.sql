-- path: sql/assertions/s09_012_projects.sql
-- Projects and time: limits, one running timer per person, submitted entries are fixed, locked periods refuse changes.
do $$
declare
  c uuid; cl uuid; p uuid; u uuid := gen_random_uuid(); e uuid; e2 uuid;
begin
  insert into public.companies (name, slug) values ('Proj Co', 'proj-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.projects (company_id, client_id, name, code, default_rate) values (c, cl, 'Website', 'WEB', 90) returning id into p;
  begin insert into public.projects (company_id, name, code) values (c, 'Other', 'web'); assert false, 'project code unique per company';
  exception when unique_violation then null; end;
  begin insert into public.projects (company_id, name, billing_type) values (c, 'Odd', 'barter'); assert false, 'known billing types';
  exception when check_violation then null; end;
  begin insert into public.projects (company_id, name, start_date, end_date) values (c, 'Odd', current_date, current_date - 1); assert false, 'end after start';
  exception when check_violation then null; end;
  insert into public.project_members (company_id, project_id, user_id, rate) values (c, p, u, 120);
  begin insert into public.project_members (company_id, project_id, user_id) values (c, p, u); assert false, 'one membership per person';
  exception when unique_violation then null; end;

  begin insert into public.time_entries (company_id, project_id, user_id, work_date, hours) values (c, p, u, current_date, 25); assert false, 'a day has 24 hours';
  exception when check_violation then null; end;
  begin insert into public.time_entries (company_id, project_id, user_id, work_date, hours) values (c, p, u, current_date, 0); assert false, 'hours above zero';
  exception when check_violation then null; end;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours, rate, description) values (c, p, u, current_date, 2.5, 120, 'Design') returning id into e;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours, timer_started_at) values (c, p, u, current_date, 0, now());
  begin insert into public.time_entries (company_id, project_id, user_id, work_date, hours, timer_started_at) values (c, p, u, current_date, 0, now()); assert false, 'one running timer per person';
  exception when unique_violation then null; end;

  update public.time_entries set hours = 3 where id = e;
  update public.time_entries set status = 'submitted', submitted_at = now() where id = e;
  begin update public.time_entries set hours = 4 where id = e; assert false, 'submitted entry is fixed';
  exception when insufficient_privilege then null; end;
  begin update public.time_entries set rate = 1 where id = e; assert false, 'rate is fixed';
  exception when insufficient_privilege then null; end;
  begin update public.time_entries set deleted_at = now() where id = e; assert false, 'submitted entry cannot be deleted';
  exception when insufficient_privilege then null; end;
  update public.time_entries set status = 'approved', approved_by = u, approved_at = now() where id = e;
  update public.time_entries set status = 'rejected', rejected_reason = 'Wrong project' where id = e;
  update public.time_entries set hours = 2, status = 'draft' where id = e;

  -- a locked period
  insert into public.time_settings (company_id, lock_through) values (c, current_date);
  begin insert into public.time_entries (company_id, project_id, user_id, work_date, hours) values (c, p, gen_random_uuid(), current_date, 1); assert false, 'locked period refuses new entries';
  exception when insufficient_privilege then null; end;
  begin update public.time_entries set hours = 5 where id = e; assert false, 'locked period refuses changes';
  exception when insufficient_privilege then null; end;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours) values (c, p, u, current_date + 1, 1) returning id into e2;
  update public.time_entries set hours = 2 where id = e2;
end
$$;
