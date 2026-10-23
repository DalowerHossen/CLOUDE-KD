-- path: sql/assertions/s08_010_import_jobs.sql
-- Import jobs: counters stay consistent, targets and states are limited, the error list is capped.
do $$
declare
  c uuid; j uuid;
begin
  insert into public.companies (name, slug) values ('Import Co', 'import-co') returning id into c;
  insert into public.import_jobs (company_id, target, file_id, file_name, file_kind, row_count) values (c, 'clients', gen_random_uuid(), 'a.csv', 'csv', 10) returning id into j;
  update public.import_jobs set processed_rows = 5, created_rows = 3, skipped_rows = 2 where id = j;
  begin update public.import_jobs set processed_rows = 11 where id = j; assert false, 'cannot process more rows than there are';
  exception when check_violation then null; end;
  begin update public.import_jobs set created_rows = 5, failed_rows = 5 where id = j; assert false, 'counters cannot exceed processed rows';
  exception when check_violation then null; end;
  begin insert into public.import_jobs (company_id, target, file_id, file_name, file_kind) values (c, 'invoices', gen_random_uuid(), 'a.csv', 'csv'); assert false, 'unknown target';
  exception when check_violation then null; end;
  begin insert into public.import_jobs (company_id, target, file_id, file_name, file_kind) values (c, 'clients', gen_random_uuid(), 'a.exe', 'exe'); assert false, 'unknown file kind';
  exception when check_violation then null; end;
  begin insert into public.import_jobs (company_id, target, file_id, file_name, file_kind, row_count) values (c, 'clients', gen_random_uuid(), 'a.csv', 'csv', 5001); assert false, 'row limit';
  exception when check_violation then null; end;
  begin update public.import_jobs set status = 'paused' where id = j; assert false, 'unknown state';
  exception when check_violation then null; end;
end
$$;
