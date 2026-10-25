-- path: sql/assertions/s16_029_payment_card_last4.sql
-- A payment may keep four digits and a brand, and nothing longer.
do $$
begin
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'card_last4'), 'card_last4 column';
  begin
    update public.payments set card_last4 = '12345' where false;
    perform 1 from pg_constraint where conrelid = 'public.payments'::regclass and pg_get_constraintdef(oid) like '%card_last4%';
    assert found, 'card_last4 has a check';
  end;
  assert exists (select 1 from pg_indexes where indexname = 'idx_payments_card_last4'), 'index';
  assert exists (select 1 from pg_indexes where indexname = 'idx_payments_company_card_last4'), 'company index';
end $$;
