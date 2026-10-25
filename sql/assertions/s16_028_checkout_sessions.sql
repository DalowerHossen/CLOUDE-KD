-- path: sql/assertions/s16_028_checkout_sessions.sql
-- Checkout sessions: RLS on, one session per order of a company, https return addresses only, a positive amount, and an open
-- session always has its invoice, link and address.
do $$
declare cid uuid; other uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace ns on ns.oid = x.relnamespace
    where ns.nspname = 'public' and x.relname = 'checkout_sessions' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Checkout co', 'checkout-co') returning id into cid;
  insert into public.companies (name, slug) values ('Checkout other', 'checkout-other') returning id into other;

  insert into public.checkout_sessions (company_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, success_url, cancel_url, expires_at)
    values (cid, 'order-1', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 10.5, 'Ann', 'ann@example.com', 'https://shop.example/ok', 'https://shop.example/no', now() + interval '1 day');
  begin
    insert into public.checkout_sessions (company_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, success_url, cancel_url, expires_at)
      values (cid, 'order-1', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 10.5, 'Ann', 'ann@example.com', 'https://shop.example/ok', 'https://shop.example/no', now() + interval '1 day');
    assert false, 'the same order made a second session';
  exception when unique_violation then null; end;
  insert into public.checkout_sessions (company_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, success_url, cancel_url, expires_at)
    values (other, 'order-1', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 3, 'Bo', 'bo@example.com', 'https://shop.example/ok', 'https://shop.example/no', now() + interval '1 day');
  begin
    insert into public.checkout_sessions (company_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, success_url, cancel_url, expires_at)
      values (cid, 'order-2', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 3, 'Bo', 'bo@example.com', 'http://shop.example/ok', 'https://shop.example/no', now() + interval '1 day');
    assert false, 'http return address accepted';
  exception when check_violation then null; end;
  begin
    insert into public.checkout_sessions (company_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, success_url, cancel_url, expires_at)
      values (cid, 'order-3', gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 0, 'Bo', 'bo@example.com', 'https://shop.example/ok', 'https://shop.example/no', now() + interval '1 day');
    assert false, 'zero amount accepted';
  exception when check_violation then null; end;

  insert into public.checkout_sessions (company_id, external_ref, status, amount, customer_name, customer_email, success_url, cancel_url)
    values (cid, 'order-claim', 'creating', 4, 'Cy', 'cy@example.com', 'https://shop.example/ok', 'https://shop.example/no');
  begin
    insert into public.checkout_sessions (company_id, external_ref, status, amount, customer_name, customer_email, success_url, cancel_url)
      values (cid, 'order-open-empty', 'open', 4, 'Cy', 'cy@example.com', 'https://shop.example/ok', 'https://shop.example/no');
    assert false, 'an open session without an invoice was accepted';
  exception when check_violation then null; end;
end $$;
