-- path: sql/assertions/s09_015_reports.sql
-- Report presets and schedules: key format, a schedule needs its day, recipients are limited, formats are known.
do $$
declare c uuid;
begin
  insert into public.companies (name, slug) values ('Rep Co', 'rep-co') returning id into c;
  insert into public.report_presets (company_id, user_id, report_key, name) values (c, gen_random_uuid(), 'sales_summary', 'Monthly sales');
  begin insert into public.report_presets (company_id, user_id, report_key, name) values (c, gen_random_uuid(), 'Bad Key', 'x'); assert false, 'key format';
  exception when check_violation then null; end;
  insert into public.report_schedules (company_id, report_key, name, format, frequency, weekday, recipients, next_run_on, created_by)
    values (c, 'sales_summary', 'Weekly', 'csv', 'weekly', 1, '["a@example.com"]', current_date + 1, gen_random_uuid());
  begin insert into public.report_schedules (company_id, report_key, name, format, frequency, recipients, next_run_on, created_by) values (c, 'sales_summary', 'x', 'csv', 'weekly', '["a@example.com"]', current_date, gen_random_uuid()); assert false, 'a weekly schedule needs a weekday';
  exception when check_violation then null; end;
  begin insert into public.report_schedules (company_id, report_key, name, format, frequency, month_day, recipients, next_run_on, created_by) values (c, 'sales_summary', 'x', 'csv', 'monthly', 31, '["a@example.com"]', current_date, gen_random_uuid()); assert false, 'month day is 1 to 28';
  exception when check_violation then null; end;
  begin insert into public.report_schedules (company_id, report_key, name, format, frequency, weekday, recipients, next_run_on, created_by) values (c, 'sales_summary', 'x', 'docx', 'weekly', 1, '["a@example.com"]', current_date, gen_random_uuid()); assert false, 'known formats';
  exception when check_violation then null; end;
  begin insert into public.report_schedules (company_id, report_key, name, format, frequency, weekday, recipients, next_run_on, created_by) values (c, 'sales_summary', 'x', 'csv', 'weekly', 1, '[]', current_date, gen_random_uuid()); assert false, 'a recipient is needed';
  exception when check_violation then null; end;
end
$$;
