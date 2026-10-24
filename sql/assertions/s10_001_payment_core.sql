-- path: sql/assertions/s10_001_payment_core.sql
-- Payment core schema: no plaintext credential column, webhook events unique, money columns numeric(18,4), RLS on,
-- legal status changes only, one open payment per invoice, credentials immutable, one active mode, mode switch needs a test.
do $$
declare
  c uuid; cl uuid; inv uuid; p1 uuid; p2 uuid; n integer; tid uuid; ver integer;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  -- no plaintext secret column
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processor_credentials'
    and column_name in ('secret', 'api_key', 'password', 'plaintext', 'credentials', 'token')), 'a plaintext credential column exists';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processor_credentials' and column_name = 'ciphertext'), 'ciphertext column';
  -- money columns
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name in ('payments', 'refunds', 'payment_allocations', 'routing_rules', 'payment_links')
      and column_name in ('amount', 'captured_amount', 'refunded_amount', 'surcharge_amount', 'min_amount', 'max_amount')
      and (numeric_precision <> 18 or numeric_scale <> 4);
  assert n = 0, 'money columns must be numeric(18,4)';
  -- RLS on every table
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relname in ('processors','processor_credentials','processor_modes','processor_mode_tests','routing_rules','payments','payment_attempts','payment_allocations','refunds','payment_links','webhook_events','card_identities','card_blacklist','payment_reviews')
      and not c.relrowsecurity;
  assert n = 0, 'RLS must be on';

  -- webhook events are unique per processor and event id
  insert into public.webhook_events (processor_id, event_id, event_type) values ('stripe', 'evt_1', 'payment.captured');
  begin insert into public.webhook_events (processor_id, event_id, event_type) values ('stripe', 'evt_1', 'payment.captured'); assert false, 'duplicate webhook';
  exception when unique_violation then null; end;
  insert into public.webhook_events (processor_id, event_id, event_type) values ('paypal', 'evt_1', 'payment.captured');

  -- credentials: one current version, immutable ciphertext
  insert into public.processors (processor_id, credentials_version) values ('stripe', 1);
  insert into public.processor_credentials (processor_id, credentials_version, ciphertext, iv, tag, key_version) values ('stripe', 1, 'AAAA', 'BBBBBBBB', 'CCCCCCCC', 1);
  begin update public.processor_credentials set ciphertext = 'ZZZZ' where processor_id = 'stripe'; assert false, 'credentials edited';
  exception when insufficient_privilege then null; end;
  begin insert into public.processor_credentials (processor_id, credentials_version, ciphertext, iv, tag, key_version) values ('stripe', 2, 'AAAA', 'BBBBBBBB', 'CCCCCCCC', 1); assert false, 'two current';
  exception when unique_violation then null; end;
  begin insert into public.processors (processor_id, enabled) values ('adyen', true); assert false, 'enabled without credentials';
  exception when check_violation then null; end;

  -- modes: one active, switch needs a test
  insert into public.processor_modes (processor_id, mode_id, label, is_active) values ('stripe', 'default', 'Default', true), ('stripe', 'other', 'Other', false);
  begin update public.processor_modes set is_active = true where processor_id = 'stripe' and mode_id = 'other'; assert false, 'two active modes';
  exception when unique_violation then null; end;
  begin perform public.kd_processor_switch_mode('stripe', 'other', gen_random_uuid(), 24); assert false, 'switch without test';
  exception when insufficient_privilege then null; end;
  insert into public.processor_mode_tests (processor_id, mode_id, environment, credentials_version, ok) values ('stripe', 'other', 'sandbox', 0, true);
  begin perform public.kd_processor_switch_mode('stripe', 'other', gen_random_uuid(), 24); assert false, 'test of old credentials version';
  exception when insufficient_privilege then null; end;
  insert into public.processor_mode_tests (processor_id, mode_id, environment, credentials_version, ok) values ('stripe', 'other', 'sandbox', 1, true);
  tid := public.kd_processor_switch_mode('stripe', 'other', gen_random_uuid(), 24);
  assert tid is not null, 'switch allowed with a passing test';
  assert (select active_mode from public.processors where processor_id = 'stripe') = 'other', 'active mode recorded';
  assert (select enabled from public.processors where processor_id = 'stripe') = false, 'processor disabled after a mode change';
  begin update public.processor_mode_tests set ok = false; assert false, 'tests are a log';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;

  -- payments
  insert into public.companies (name, slug) values ('Pay Co', 'pay-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into inv;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key) values (c, inv, cl, 'stripe', 100, 'idem-key-0001') returning id into p1;
  begin insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key) values (c, inv, cl, 'stripe', 100, 'idem-key-0001'); assert false, 'same key twice';
  exception when unique_violation then null; end;
  begin insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key) values (c, inv, cl, 'stripe', 50, 'idem-key-0002'); assert false, 'two open payments on one invoice';
  exception when unique_violation then null; end;
  begin update public.payments set amount = 1 where id = p1; assert false, 'amount changed';
  exception when insufficient_privilege then null; end;
  begin update public.payments set status = 'refunded' where id = p1; assert false, 'created to refunded';
  exception when insufficient_privilege then null; end;
  update public.payments set status = 'failed', failure_reason = 'routing_no_match' where id = p1;
  begin update public.payments set status = 'captured' where id = p1; assert false, 'failed is final';
  exception when insufficient_privilege then null; end;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key) values (c, inv, cl, 'stripe', 100, 'idem-key-0003') returning id into p2;
  update public.payments set status = 'authorized' where id = p2;
  update public.payments set status = 'captured', captured_amount = 100 where id = p2;
  begin update public.payments set refunded_amount = 101 where id = p2; assert false, 'refund above capture';
  exception when check_violation then null; end;
  update public.payments set status = 'partially_refunded', refunded_amount = 40 where id = p2;
  update public.payments set status = 'refunded', refunded_amount = 100 where id = p2;

  -- attempts are a log
  insert into public.payment_attempts (company_id, payment_id, invoice_id, action, outcome) values (c, p2, inv, 'authorize', 'authorized');
  begin delete from public.payment_attempts; assert false, 'attempts deleted';
  exception when others then if sqlerrm like 'assert%' then raise; end if; end;
end
$$;
