-- path: sql/assertions/s16_039_processor_applications.sql
-- Both tables have row level security, the standard columns, and one open application per company and processor.
do $$
begin
  assert (select count(*) from pg_class where relname in ('processor_applications', 'processor_application_events') and relrowsecurity) = 2, 'rls on';
  assert (select count(*) from information_schema.columns where table_name = 'processor_applications' and column_name in ('id', 'company_id', 'created_at', 'updated_at', 'deleted_at', 'version')) = 6, 'standard columns';
  assert exists (select 1 from pg_indexes where indexname = 'uq_processor_application_one_open'), 'one open application';
  assert exists (select 1 from pg_indexes where indexname = 'uq_processor_application_event'), 'event once';
end $$;
