-- path: sql/assertions/s15_013_hr.sql
-- HR: RLS on; departments nest without loops and six levels at most; same-company references; the reporting line has no loop and no
-- self manager; a checklist is done when all its items are ticked; leave: a request cannot ask for more than is left (counting the
-- requests still waiting), dates cannot overlap, approval takes the days from the balance once, a cancelled approval gives them
-- back, a request cannot change, used never passes entitled; performance: ratings only on reviews, 1 to 5.
do $$
declare
  c uuid; d uuid; e1 uuid; e2 uuid; e3 uuid; ed uuid; d1 uuid; d2 uuid; d3 uuid; dx uuid; p1 uuid; lt uuid; ltd uuid; bal uuid;
  r1 uuid; r2 uuid; r3 uuid; cl uuid; i1 uuid; i2 uuid; n integer; st text; u numeric;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('departments', 'positions', 'checklist_templates', 'checklist_template_items', 'checklists', 'checklist_items', 'leave_types', 'leave_balances', 'leave_requests', 'performance_notes') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Hr Co', 'hr-co') returning id into c;
  insert into public.companies (name, slug) values ('Hr Other', 'hr-other') returning id into d;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Ann', 'Lee', 'ann@hr.example', date '2026-01-01') returning id into e1;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Bob', 'Ray', 'bob@hr.example', date '2026-01-01') returning id into e2;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Cy', 'Day', 'cy@hr.example', date '2026-01-01') returning id into e3;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (d, 'Di', 'Fox', 'di@hr.example', date '2026-01-01') returning id into ed;

  -- departments
  insert into public.departments (company_id, name, head_employee_id) values (c, 'Operations', e1) returning id into d1;
  insert into public.departments (company_id, name, parent_id) values (c, 'Support', d1) returning id into d2;
  begin insert into public.departments (company_id, name, parent_id) values (c, 'support', d1); assert false, 'name once under a parent';
  exception when unique_violation then null; end;
  begin update public.departments set parent_id = d2 where id = d1; assert false, 'department loop';
  exception when invalid_parameter_value then null; end;
  begin insert into public.departments (company_id, name, head_employee_id) values (c, 'Bad head', ed); assert false, 'head of another company';
  exception when no_data_found then null; end;
  begin insert into public.departments (company_id, name, parent_id) values (d, 'Cross', d1); assert false, 'parent of another company';
  exception when no_data_found then null; end;
  d3 := d2;
  for i in 1..4 loop insert into public.departments (company_id, name, parent_id) values (c, 'Level ' || i, d3) returning id into d3; end loop;
  begin insert into public.departments (company_id, name, parent_id) values (c, 'Too deep', d3); assert false, 'six levels at most';
  exception when invalid_parameter_value then null; end;
  insert into public.positions (company_id, title, department_id) values (c, 'Agent', d2) returning id into p1;
  update public.employees set department_id = d2, position_id = p1, manager_id = e1 where id = e2;
  begin update public.employees set department_id = d1 where id = ed; assert false, 'department of another company';
  exception when no_data_found then null; end;

  -- reporting line
  begin update public.employees set manager_id = e2 where id = e1; assert false, 'reporting loop';
  exception when invalid_parameter_value then null; end;
  begin update public.employees set manager_id = e1 where id = e1; assert false, 'own manager';
  exception when invalid_parameter_value or check_violation then null; end;
  begin update public.employees set manager_id = ed where id = e3; assert false, 'manager of another company';
  exception when no_data_found then null; end;
  update public.employees set manager_id = e2 where id = e3;

  -- checklists follow their items
  insert into public.checklists (company_id, employee_id, kind, name) values (c, e1, 'onboarding', 'Welcome') returning id into cl;
  insert into public.checklist_items (company_id, checklist_id, position, title) values (c, cl, 1, 'Laptop') returning id into i1;
  insert into public.checklist_items (company_id, checklist_id, position, title) values (c, cl, 2, 'Accounts') returning id into i2;
  select status into st from public.checklists where id = cl; assert st = 'open', 'open with items to do';
  update public.checklist_items set done_at = now() where id = i1;
  select status into st from public.checklists where id = cl; assert st = 'open', 'still open';
  update public.checklist_items set done_at = now() where id = i2;
  select status into st from public.checklists where id = cl; assert st = 'done', 'done when all ticked';
  update public.checklist_items set done_at = null where id = i2;
  select status into st from public.checklists where id = cl; assert st = 'open', 'open again';
  begin insert into public.checklist_items (company_id, checklist_id, position, title) values (c, cl, 2, 'Again'); assert false, 'position once';
  exception when unique_violation then null; end;

  -- leave
  insert into public.leave_types (company_id, name, annual_days) values (c, 'Annual', 20) returning id into lt;
  insert into public.leave_types (company_id, name, annual_days) values (d, 'Annual', 20) returning id into ltd;
  begin insert into public.leave_types (company_id, name, annual_days) values (c, 'annual', 5); assert false, 'type name once';
  exception when unique_violation then null; end;
  insert into public.leave_balances (company_id, employee_id, leave_type_id, year, entitled) values (c, e1, lt, 2026, 10) returning id into bal;
  begin insert into public.leave_balances (company_id, employee_id, leave_type_id, year, entitled) values (c, e1, lt, 2026, 5); assert false, 'one balance per year';
  exception when unique_violation then null; end;
  begin insert into public.leave_balances (company_id, employee_id, leave_type_id, year, entitled) values (c, e1, ltd, 2027, 5); assert false, 'type of another company';
  exception when no_data_found then null; end;
  begin insert into public.leave_balances (company_id, employee_id, leave_type_id, year, entitled, used) values (c, e2, lt, 2026, 5, 6); assert false, 'used above entitled';
  exception when check_violation then null; end;

  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e2, lt, date '2026-03-02', date '2026-03-03', 2); assert false, 'no balance';
  exception when check_violation then null; end;
  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-03-02', date '2026-03-12', 11); assert false, 'more than left';
  exception when check_violation then null; end;
  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-12-30', date '2027-01-02', 2); assert false, 'one calendar year';
  exception when check_violation then null; end;
  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-03-02', date '2026-03-03', 5); assert false, 'days more than the dates';
  exception when check_violation then null; end;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-03-02', date '2026-03-06', 5) returning id into r1;
  -- 5 waiting: only 5 left to ask for
  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-04-06', date '2026-04-11', 6); assert false, 'waiting days count';
  exception when check_violation then null; end;
  begin insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-03-05', date '2026-03-06', 2); assert false, 'overlap';
  exception when unique_violation then null; end;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-04-06', date '2026-04-10', 5) returning id into r2;
  begin update public.leave_requests set days = 1 where id = r1; assert false, 'a request cannot change';
  exception when object_not_in_prerequisite_state then null; end;

  update public.leave_requests set status = 'approved', decided_at = now() where id = r1;
  select used into u from public.leave_balances where id = bal; assert u = 5, 'approval takes the days once';
  update public.leave_requests set decision_note = 'enjoy' where id = r1;
  select used into u from public.leave_balances where id = bal; assert u = 5, 'a later change of the note does not take days again';
  begin update public.leave_requests set status = 'pending', decided_at = null where id = r1; assert false, 'approved cannot go back';
  exception when object_not_in_prerequisite_state then null; end;
  update public.leave_requests set status = 'approved', decided_at = now() where id = r2;
  select used into u from public.leave_balances where id = bal; assert u = 10, 'second approval';
  update public.leave_requests set status = 'cancelled' where id = r1;
  select used into u from public.leave_balances where id = bal; assert u = 5, 'cancelling gives the days back';
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days) values (c, e1, lt, date '2026-05-04', date '2026-05-08', 5) returning id into r3;
  update public.leave_requests set status = 'rejected', decided_at = now(), decision_note = 'busy' where id = r3;
  select used into u from public.leave_balances where id = bal; assert u = 5, 'a rejection takes nothing';
  begin update public.leave_requests set status = 'approved', decided_at = now() where id = r3; assert false, 'rejected is final';
  exception when object_not_in_prerequisite_state then null; end;

  -- performance
  insert into public.performance_notes (company_id, employee_id, kind, body) values (c, e1, 'note', 'Good week');
  insert into public.performance_notes (company_id, employee_id, kind, period, rating, body) values (c, e1, 'review', '2026 Q1', 4, 'Solid');
  begin insert into public.performance_notes (company_id, employee_id, kind, rating, body) values (c, e1, 'note', 3, 'x'); assert false, 'rating only on reviews';
  exception when check_violation then null; end;
  begin insert into public.performance_notes (company_id, employee_id, kind, period, rating, body) values (c, e1, 'review', '2026 Q1', 6, 'x'); assert false, 'rating 1 to 5';
  exception when check_violation then null; end;
  begin insert into public.performance_notes (company_id, employee_id, kind, body) values (c, e1, 'review', 'x'); assert false, 'review needs rating and period';
  exception when check_violation then null; end;
  begin insert into public.performance_notes (company_id, employee_id, kind, body) values (c, ed, 'note', 'x'); assert false, 'employee of another company is fine only for its company';
  exception when no_data_found then null; end;
end
$$;
