-- path: sql/assertions/s16_040_company_processor_accounts.sql
-- The table has row level security and one account per company and processor; payments remember their account.
do $$
begin
  assert (select relrowsecurity from pg_class where relname = 'company_processor_accounts'), 'rls on';
  assert exists (select 1 from pg_indexes where indexname = 'uq_company_processor_account'), 'one account per company and processor';
  assert exists (select 1 from information_schema.columns where table_name = 'payments' and column_name = 'account_id'), 'payments.account_id';
end $$;
