-- path: sql/assertions/s16_014_commerce.sql
-- Commerce tables: RLS on; a store is unique by provider and address and its webhook key is unique; an order is kept once per store
-- and order id and moves one way (finished orders are final); rows belong to the company of their store and order; the log and the
-- delivery ids do not change; a mapping is made once per SKU; a conflict is recorded once per order, kind and detail.
do $$
declare
  c uuid; d uuid; i uuid; i2 uuid; o uuid; n integer; cf uuid;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
  pid uuid := '11111111-1111-4111-8111-111111111111';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('integrations', 'integration_orders', 'integration_webhook_events', 'integration_sync_log',
      'integration_mappings', 'integration_conflicts') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Shop Co', 'shop-co') returning id into c;
  insert into public.companies (name, slug) values ('Shop Other', 'shop-other') returning id into d;
  insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (c, 'shopify', 'Main shop', 'main.myshopify.com', enc, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') returning id into i;
  insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (c, 'woocommerce', 'Woo', 'https://woo.example.test', enc, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') returning id into i2;
  begin insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (d, 'shopify', 'Same shop', 'MAIN.myshopify.com', enc, 'cccccccccccccccccccccccccccccccc'); assert false, 'a store belongs to one company';
  exception when unique_violation then null; end;
  begin insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (d, 'shopify', 'Same key', 'other.myshopify.com', enc, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); assert false, 'webhook key once';
  exception when unique_violation then null; end;
  begin insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (d, 'etsy', 'Bad', 'x.example.test', enc, 'dddddddddddddddddddddddddddddddd'); assert false, 'provider list';
  exception when check_violation then null; end;
  begin insert into public.integrations (company_id, provider, name, store_url, credentials_enc, webhook_key)
    values (d, 'shopify', 'Bad key', 'k.myshopify.com', enc, 'short'); assert false, 'key shape';
  exception when check_violation then null; end;
  begin update public.integrations set provider = 'woocommerce' where id = i; assert false, 'provider fixed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.integrations set store_url = 'else.myshopify.com' where id = i; assert false, 'address fixed';
  exception when object_not_in_prerequisite_state then null; end;
  update public.integrations set sync_mode = 'hourly', status = 'paused' where id = i;
  begin update public.integrations set sync_mode = 'weekly' where id = i; assert false, 'sync mode list';
  exception when check_violation then null; end;

  -- orders
  insert into public.integration_orders (company_id, integration_id, external_id, external_number, payload, email, currency, total)
    values (c, i, '1001', '#1001', '{"id": "1001"}', 'a@example.test', 'USD', 12.5) returning id into o;
  begin insert into public.integration_orders (company_id, integration_id, external_id, payload) values (c, i, '1001', '{}'); assert false, 'an order is kept once';
  exception when unique_violation then null; end;
  begin insert into public.integration_orders (company_id, integration_id, external_id, payload) values (d, i, '2002', '{}'); assert false, 'order of another company';
  exception when no_data_found then null; end;
  begin insert into public.integration_orders (company_id, integration_id, external_id, payload, status) values (c, i, '2003', '{}', 'shipped'); assert false, 'status list';
  exception when check_violation then null; end;
  begin update public.integration_orders set external_id = '9' where id = o; assert false, 'order id fixed';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.integration_orders set status = 'synced', invoice_id = pid where id = o; assert false, 'received cannot jump to synced';
  exception when object_not_in_prerequisite_state then null; end;
  update public.integration_orders set status = 'conflict' where id = o;
  update public.integration_orders set status = 'received' where id = o;
  update public.integration_orders set status = 'client_ready', client_id = pid where id = o;
  begin update public.integration_orders set status = 'synced' where id = o; assert false, 'synced needs an invoice';
  exception when check_violation then null; end;
  update public.integration_orders set status = 'synced', invoice_id = pid where id = o;
  begin update public.integration_orders set status = 'received' where id = o; assert false, 'synced is final';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.integration_orders set payload = '{"id": "changed"}' where id = o; assert false, 'a finished order keeps its payload';
  exception when object_not_in_prerequisite_state then null; end;

  -- delivery ids
  insert into public.integration_webhook_events (company_id, integration_id, webhook_id, topic) values (c, i, 'wh-1', 'orders/create');
  begin insert into public.integration_webhook_events (company_id, integration_id, webhook_id, topic) values (c, i, 'wh-1', 'orders/create'); assert false, 'a delivery is handled once';
  exception when unique_violation then null; end;
  begin update public.integration_webhook_events set topic = 'x' where integration_id = i; assert false, 'delivery ids do not change';
  exception when object_not_in_prerequisite_state then null; end;

  -- log
  insert into public.integration_sync_log (company_id, integration_id, order_id, event, message) values (c, i, o, 'order', 'Order received');
  begin insert into public.integration_sync_log (company_id, integration_id, order_id, event, message) values (c, i2, o, 'order', 'Wrong store'); assert false, 'order of another store';
  exception when no_data_found then null; end;
  begin insert into public.integration_sync_log (company_id, integration_id, event, message) values (c, i, 'dance', 'x'); assert false, 'event list';
  exception when check_violation then null; end;
  begin update public.integration_sync_log set message = 'changed' where integration_id = i; assert false, 'the log does not change';
  exception when object_not_in_prerequisite_state then null; end;

  update public.integration_sync_log set deleted_at = now() where integration_id = i;
  select count(*) into n from public.integration_sync_log where integration_id = i and deleted_at is not null;
  assert n = 1, 'an old log line can be removed';

  -- mappings
  insert into public.integration_mappings (company_id, integration_id, external_sku, product_id) values (c, i, 'SKU-1', pid);
  begin insert into public.integration_mappings (company_id, integration_id, external_sku, product_id) values (c, i, 'sku-1', pid); assert false, 'a SKU is mapped once';
  exception when unique_violation then null; end;

  -- conflicts
  insert into public.integration_orders (company_id, integration_id, external_id, payload) values (c, i, '1002', '{}') returning id into o;
  insert into public.integration_conflicts (company_id, integration_id, order_id, kind, detail) values (c, i, o, 'unmapped_sku', 'ABC') returning id into cf;
  begin insert into public.integration_conflicts (company_id, integration_id, order_id, kind, detail) values (c, i, o, 'unmapped_sku', 'ABC'); assert false, 'a conflict is recorded once';
  exception when unique_violation then null; end;
  begin insert into public.integration_conflicts (company_id, integration_id, order_id, kind, detail) values (c, i, o, 'weather', 'x'); assert false, 'kind list';
  exception when check_violation then null; end;
  begin update public.integration_conflicts set status = 'resolved' where id = cf; assert false, 'resolved needs its time';
  exception when check_violation then null; end;
  update public.integration_conflicts set status = 'resolved', resolved_at = now(), resolution = 'Mapped' where id = cf;
end
$$;
