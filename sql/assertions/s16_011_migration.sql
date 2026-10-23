-- path: sql/assertions/s16_011_migration.sql
-- Migration tables: RLS on; a job starts uploaded and moves in the allowed ways only; it cannot be queued before a dry run report
-- exists; its source, target and file are fixed and its mapping is fixed once queued; the claim takes work once and starts a queued
-- job; rows are written only while the job runs, are one per file row, need the record id when created, and a rollback may only
-- mark created rows as rolled back or blocked; the 24 hour window decides whether a rollback may start.
do $$
declare
  c uuid; d uuid; j uuid; r uuid; rec uuid := public.uuid_generate_v7(); n integer; s text;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('migration_jobs', 'migration_rows') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Mig Co', 'mig-co') returning id into c;
  insert into public.companies (name, slug) values ('Mig Other', 'mig-other') returning id into d;

  begin insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count) values (c, 'sage', 'clients', public.uuid_generate_v7(), 'a.csv', 'csv', 10); assert false, 'source list';
  exception when check_violation then null; end;
  begin insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count) values (c, 'xero', 'invoices', public.uuid_generate_v7(), 'a.csv', 'csv', 10); assert false, 'target list';
  exception when check_violation then null; end;
  begin insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count) values (c, 'xero', 'clients', public.uuid_generate_v7(), 'a.csv', 'csv', 5001); assert false, 'row limit';
  exception when check_violation then null; end;
  begin insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count, status) values (c, 'xero', 'clients', public.uuid_generate_v7(), 'a.csv', 'csv', 10, 'committed'); assert false, 'starts uploaded';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count) values (c, 'quickbooks', 'clients', public.uuid_generate_v7(), 'customers.csv', 'csv', 10) returning id into j;

  begin update public.migration_jobs set status = 'queued' where id = j; assert false, 'uploaded cannot be queued';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.migration_jobs set target = 'products' where id = j; assert false, 'target fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.migration_jobs set status = 'validated', mapping = '{"name":"Customer"}', report = '{"valid":10}' where id = j;
  begin update public.migration_jobs set status = 'running' where id = j; assert false, 'validated cannot jump to running';
  exception when object_not_in_prerequisite_state then null; end;

  -- a job without a dry run cannot be queued
  insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count) values (d, 'zoho', 'products', public.uuid_generate_v7(), 'items.csv', 'csv', 3) returning id into r;
  update public.migration_jobs set status = 'validated' where id = r;
  begin update public.migration_jobs set status = 'queued' where id = r; assert false, 'needs a dry run report';
  exception when object_not_in_prerequisite_state then null; end;

  -- rows are written only while the job runs
  begin insert into public.migration_rows (company_id, job_id, row_number, action, record_id) values (c, j, 2, 'created', rec); assert false, 'job not running';
  exception when object_not_in_prerequisite_state then null; end;
  update public.migration_jobs set status = 'queued' where id = j;
  begin update public.migration_jobs set mapping = '{"name":"Other"}' where id = j; assert false, 'mapping fixed once queued';
  exception when object_not_in_prerequisite_state then null; end;
  select count(*) into n from public.kd_claim_migration_jobs(5, 300);
  assert n = 1, 'the queued job is claimed';
  select status into s from public.migration_jobs where id = j;
  assert s = 'running', 'a claimed queued job is running';
  select count(*) into n from public.kd_claim_migration_jobs(5, 300);
  assert n = 0, 'a locked job is not claimed again';
  update public.migration_jobs set locked_until = now() - interval '1 minute' where id = j;
  select count(*) into n from public.kd_claim_migration_jobs(5, 300);
  assert n = 1, 'a job whose lock ran out is claimed again';

  insert into public.migration_rows (company_id, job_id, row_number, action, record_id) values (c, j, 2, 'created', rec);
  insert into public.migration_rows (company_id, job_id, row_number, action, message) values (c, j, 3, 'skipped', 'Duplicate');
  insert into public.migration_rows (company_id, job_id, row_number, action, message) values (c, j, 4, 'failed', 'Bad e-mail');
  begin insert into public.migration_rows (company_id, job_id, row_number, action, record_id) values (c, j, 2, 'created', rec); assert false, 'one row per file row';
  exception when unique_violation then null; end;
  begin insert into public.migration_rows (company_id, job_id, row_number, action) values (c, j, 5, 'created'); assert false, 'created needs a record';
  exception when check_violation then null; end;
  begin insert into public.migration_rows (company_id, job_id, row_number, action) values (d, j, 6, 'skipped'); assert false, 'row of another company';
  exception when no_data_found then null; end;
  begin insert into public.migration_rows (company_id, job_id, row_number, action, record_id) values (c, j, 7, 'rolled_back', rec); assert false, 'starts created, skipped or failed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.migration_rows set action = 'rolled_back' where job_id = j and row_number = 3; assert false, 'a skipped row is not rolled back';
  exception when object_not_in_prerequisite_state or check_violation then null; end;
  begin update public.migration_rows set record_id = public.uuid_generate_v7() where job_id = j and row_number = 2; assert false, 'record fixed';
  exception when object_not_in_prerequisite_state then null; end;

  -- finish, then roll back inside the window
  update public.migration_jobs set status = 'committed', committed_at = now(), rollback_until = now() + interval '24 hours', processed_rows = 3, created_rows = 1, skipped_rows = 1, failed_rows = 1 where id = j;
  begin update public.migration_jobs set processed_rows = 11 where id = j; assert false, 'processed not above rows';
  exception when check_violation then null; end;
  begin update public.migration_jobs set status = 'running' where id = j; assert false, 'committed does not run again';
  exception when object_not_in_prerequisite_state then null; end;
  update public.migration_jobs set status = 'rolling_back' where id = j;
  update public.migration_rows set action = 'rollback_blocked', message = 'The client has invoices.' where job_id = j and row_number = 2;
  update public.migration_rows set action = 'created', message = null where job_id = j and row_number = 2;
  update public.migration_rows set action = 'rolled_back' where job_id = j and row_number = 2;
  begin update public.migration_rows set action = 'created' where job_id = j and row_number = 2; assert false, 'rolled back is final';
  exception when object_not_in_prerequisite_state then null; end;
  update public.migration_jobs set status = 'rollback_partial' where id = j;
  update public.migration_jobs set status = 'rolling_back' where id = j;
  update public.migration_jobs set status = 'rolled_back', rolled_back_at = now() where id = j;
  begin update public.migration_jobs set status = 'rolling_back' where id = j; assert false, 'rolled back is final';
  exception when object_not_in_prerequisite_state then null; end;

  -- the window
  insert into public.migration_jobs (company_id, source, target, file_id, file_name, file_kind, row_count, status) values (c, 'wave', 'clients', public.uuid_generate_v7(), 'w.csv', 'csv', 2, 'uploaded') returning id into r;
  update public.migration_jobs set status = 'validated', report = '{"valid":2}' where id = r;
  update public.migration_jobs set status = 'queued' where id = r;
  update public.migration_jobs set status = 'running' where id = r;
  update public.migration_jobs set status = 'committed', committed_at = now() - interval '25 hours', rollback_until = now() - interval '1 hour' where id = r;
  begin update public.migration_jobs set status = 'rolling_back' where id = r; assert false, 'window over';
  exception when object_not_in_prerequisite_state then null; end;
end
$$;
