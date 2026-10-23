-- path: sql/assertions/s16_015_bankfeed.sql
-- Bank feed tables: RLS on; a link is unique by provider and aggregator id, its webhook key is unique, and its identity does not change; an
-- active link has its aggregator id; a disconnected link stays disconnected; accounts and batches belong to the company and link
-- they point to; an aggregator account is kept once per link; a batch key is used once per account.
do $$
declare
  c uuid; d uuid; k uuid; k2 uuid; a uuid; a2 uuid; n integer;
  enc jsonb := '{"ciphertext":"x","iv":"y","tag":"z","keyVersion":1}';
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname in ('bank_feed_connections', 'bank_feed_accounts', 'bank_feed_batches') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';

  insert into public.companies (name, slug) values ('Feed Co', 'feed-co') returning id into c;
  insert into public.companies (name, slug) values ('Feed Other', 'feed-other') returning id into d;
  insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key)
    values (c, 'plaid', 'Plaid', enc, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') returning id into k;
  insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key)
    values (c, 'saltedge', 'Salt Edge', enc, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') returning id into k2;
  begin insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key)
    values (d, 'plaid', 'Same key', enc, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); assert false, 'webhook key once';
  exception when unique_violation then null; end;
  begin insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key)
    values (d, 'yodlee', 'Bad', enc, 'cccccccccccccccccccccccccccccccc'); assert false, 'provider list';
  exception when check_violation then null; end;
  begin insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key, status)
    values (d, 'plaid', 'No item', enc, 'dddddddddddddddddddddddddddddddd', 'active'); assert false, 'active needs the aggregator id';
  exception when check_violation then null; end;
  begin update public.bank_feed_connections set provider = 'saltedge' where id = k; assert false, 'provider fixed';
  exception when object_not_in_prerequisite_state then null; end;

  update public.bank_feed_connections set external_id = 'item-1', status = 'active' where id = k;
  begin update public.bank_feed_connections set external_id = 'item-2' where id = k; assert false, 'aggregator id fixed';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.bank_feed_connections (company_id, provider, name, credentials_enc, webhook_key, external_id)
    values (d, 'plaid', 'Same item', enc, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'item-1'); assert false, 'a link belongs to one company';
  exception when unique_violation then null; end;
  update public.bank_feed_connections set status = 'needs_reauth' where id = k;
  update public.bank_feed_connections set status = 'active' where id = k;
  update public.bank_feed_connections set status = 'disconnected' where id = k;
  begin update public.bank_feed_connections set status = 'active' where id = k; assert false, 'disconnected stays';
  exception when object_not_in_prerequisite_state then null; end;

  -- accounts
  insert into public.bank_feed_accounts (company_id, connection_id, external_id, name, mask, currency) values (c, k2, 'acc-1', 'Checking', '0000', 'USD') returning id into a;
  insert into public.bank_feed_accounts (company_id, connection_id, external_id, name) values (c, k2, 'acc-2', 'Savings') returning id into a2;
  begin insert into public.bank_feed_accounts (company_id, connection_id, external_id, name) values (c, k2, 'acc-1', 'Again'); assert false, 'an account is kept once';
  exception when unique_violation then null; end;
  begin insert into public.bank_feed_accounts (company_id, connection_id, external_id, name) values (d, k2, 'acc-9', 'Other company'); assert false, 'account of another company';
  exception when no_data_found then null; end;
  begin insert into public.bank_feed_accounts (company_id, connection_id, external_id, name, currency) values (c, k2, 'acc-8', 'Bad', 'usd'); assert false, 'currency shape';
  exception when check_violation then null; end;
  begin update public.bank_feed_accounts set connection_id = k where id = a; assert false, 'link of an account fixed';
  exception when object_not_in_prerequisite_state or no_data_found then null; end;

  -- batches
  insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key, line_count, imported_count, skipped_count) values (c, k2, a, 'first->c1', 5, 3, 2);
  begin insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key, line_count) values (c, k2, a, 'first->c1', 1); assert false, 'a batch key once per account';
  exception when unique_violation then null; end;
  insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key, line_count) values (c, k2, a2, 'first->c1', 1);
  begin insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key, line_count, imported_count) values (c, k2, a, 'x', 1, 2); assert false, 'counts add up';
  exception when check_violation then null; end;
  begin insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key) values (c, k, a, 'y'); assert false, 'account of another link';
  exception when no_data_found then null; end;
  begin insert into public.bank_feed_batches (company_id, connection_id, feed_account_id, batch_key, status) values (c, k2, a, 'z', 'maybe'); assert false, 'status list';
  exception when check_violation then null; end;
end
$$;
