-- path: sql/assertions/s15_011_pay_runs.sql
-- Pay runs: RLS on; run numbers PR-YYYY-NNNN per company and year; the status moves one way; a submitted run cannot change its totals
-- or period; items only for draft runs, with the run's period and employees of the same company; an employee is never paid twice for
-- overlapping days (exact duplicate and overlap); items of a submitted run keep their figures but take payment fields.
do $$
declare
  c uuid; d uuid; e1 uuid; e2 uuid; ed uuid; r1 uuid; r2 uuid; r3 uuid; i1 uuid; n integer; num text;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('pay_runs', 'pay_run_items') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Run Co', 'run-co') returning id into c;
  insert into public.companies (name, slug) values ('Run Other', 'run-other') returning id into d;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Ann', 'Lee', 'ann@run.example', date '2026-01-01') returning id into e1;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Bob', 'Ray', 'bob@run.example', date '2026-01-01') returning id into e2;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (d, 'Cy', 'Day', 'cy@run.example', date '2026-01-01') returning id into ed;

  insert into public.pay_runs (company_id, period_start, period_end, pay_date, frequency) values (c, date '2026-04-01', date '2026-04-30', date '2026-04-30', 'monthly') returning id into r1;
  select run_number into num from public.pay_runs where id = r1;
  assert num = 'PR-2026-0001', 'first run number';
  insert into public.pay_runs (company_id, period_start, period_end, pay_date, frequency) values (c, date '2026-05-01', date '2026-05-31', date '2026-05-31', 'monthly') returning id into r2;
  select run_number into num from public.pay_runs where id = r2;
  assert num = 'PR-2026-0002', 'second run number';
  begin update public.pay_runs set run_number = 'PR-2026-0099' where id = r1; assert false, 'number cannot change';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.pay_runs (company_id, period_start, period_end, pay_date, frequency) values (c, date '2026-06-30', date '2026-06-01', date '2026-06-30', 'monthly'); assert false, 'period order';
  exception when check_violation then null; end;

  insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, gross, net) values (c, r1, e1, 'EMP-0001', 'Ann Lee', date '2026-04-01', date '2026-04-30', 5000, 4000) returning id into i1;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, gross, net) values (c, r1, e1, 'EMP-0001', 'Ann Lee', date '2026-04-01', date '2026-04-30', 5000, 4000); assert false, 'one item per run and employee';
  exception when unique_violation then null; end;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r1, ed, 'EMP-0001', 'Cy Day', date '2026-04-01', date '2026-04-30', 1); assert false, 'employee of another company';
  exception when no_data_found then null; end;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r1, e2, 'EMP-0002', 'Bob Ray', date '2026-04-02', date '2026-04-30', 1); assert false, 'the run period';
  exception when invalid_parameter_value then null; end;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r1, e2, 'EMP-0002', 'Bob Ray', date '2026-04-01', date '2026-04-30', -1); assert false, 'net not negative';
  exception when check_violation then null; end;

  -- a second run for overlapping days: the same employee cannot be paid twice
  insert into public.pay_runs (company_id, period_start, period_end, pay_date, frequency) values (c, date '2026-04-15', date '2026-05-14', date '2026-05-14', 'monthly') returning id into r3;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r3, e1, 'EMP-0001', 'Ann Lee', date '2026-04-15', date '2026-05-14', 1); assert false, 'overlapping period';
  exception when unique_violation then null; end;
  insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r3, e2, 'EMP-0002', 'Bob Ray', date '2026-04-15', date '2026-05-14', 1);
  -- an item that is no longer active (a discarded run) does not block the same days
  update public.pay_run_items set active = false where run_id = r1;
  insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r3, e1, 'EMP-0001', 'Ann Lee', date '2026-04-15', date '2026-05-14', 1);
end
$$;

do $$
declare
  c uuid; e1 uuid; r1 uuid; i1 uuid; st text;
begin
  insert into public.companies (name, slug) values ('Run Co 2', 'run-co-2') returning id into c;
  insert into public.employees (company_id, first_name, last_name, email, join_date) values (c, 'Ann', 'Lee', 'ann@run2.example', date '2026-01-01') returning id into e1;
  insert into public.pay_runs (company_id, period_start, period_end, pay_date, frequency) values (c, date '2026-04-01', date '2026-04-30', date '2026-04-30', 'monthly') returning id into r1;
  insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, gross, net) values (c, r1, e1, 'EMP-0001', 'Ann Lee', date '2026-04-01', date '2026-04-30', 5000, 4000) returning id into i1;

  begin update public.pay_runs set status = 'approved', approved_at = now() where id = r1; assert false, 'draft cannot skip to approved';
  exception when object_not_in_prerequisite_state then null; end;
  update public.pay_runs set status = 'calculated', gross = 5000, net = 4000, employee_count = 1, calculated_at = now() where id = r1;
  update public.pay_runs set status = 'draft' where id = r1;
  update public.pay_runs set status = 'calculated' where id = r1;
  update public.pay_runs set status = 'submitted', submitted_at = now() where id = r1;
  begin update public.pay_runs set net = 1 where id = r1; assert false, 'a submitted run keeps its totals';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.pay_runs set period_end = date '2026-05-01' where id = r1; assert false, 'a submitted run keeps its period';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.pay_run_items set net = 1 where id = i1; assert false, 'items of a submitted run keep their figures';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.pay_run_items (company_id, run_id, employee_id, employee_number, employee_name, period_start, period_end, net) values (c, r1, e1, 'EMP-0001', 'Ann Lee', date '2026-04-01', date '2026-04-30', 1); assert false, 'a submitted run takes no items';
  exception when object_not_in_prerequisite_state or unique_violation then null; end;
  begin update public.pay_runs set status = 'paid', paid_at = now(), paid_on = date '2026-04-30' where id = r1; assert false, 'submitted cannot be paid before approval';
  exception when object_not_in_prerequisite_state then null; end;
  update public.pay_runs set status = 'approved', approved_at = now() where id = r1;
  update public.pay_run_items set payslip_sha256 = repeat('a', 64), payslip_at = now() where id = i1;
  update public.pay_runs set status = 'paid', paid_at = now(), paid_on = date '2026-04-30', payment_method = 'bank_transfer', payment_reference = 'TRF-1' where id = r1;
  update public.pay_run_items set payment_status = 'paid', paid_on = date '2026-04-30' where id = i1;
  begin update public.pay_runs set payment_reference = 'other' where id = r1; assert false, 'a paid run keeps its reference';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.pay_runs set status = 'approved', paid_at = null where id = r1; assert false, 'paid is final';
  exception when object_not_in_prerequisite_state then null; end;
  update public.pay_runs set event_published_at = now() where id = r1;
  select status into st from public.pay_runs where id = r1;
  assert st = 'paid', 'paid';
end
$$;
