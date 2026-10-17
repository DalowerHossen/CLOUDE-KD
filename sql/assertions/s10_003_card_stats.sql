-- path: sql/assertions/s10_003_card_stats.sql
-- Card statistics: counted failures only, windows respected, other cards per address, same card on the same invoice.
do $$
declare
  c uuid; cl uuid; i1 uuid; i2 uuid; card1 uuid; card2 uuid; card3 uuid; p uuid; s record;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Card Co', 'card-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into i1;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into i2;
  insert into public.card_identities (processor_id, identity_type, identity_hmac) values ('stripe', 'fingerprint', repeat('a', 64)) returning id into card1;
  insert into public.card_identities (processor_id, identity_type, identity_hmac) values ('stripe', 'fingerprint', repeat('b', 64)) returning id into card2;
  insert into public.card_identities (processor_id, identity_type, identity_hmac) values ('stripe', 'fingerprint', repeat('c', 64)) returning id into card3;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key, status) values (c, i1, cl, 'stripe', 10, 'idem-card-0001', 'failed') returning id into p;

  -- two counted failures, one insufficient funds (not counted), all from one address
  insert into public.payment_attempts (company_id, payment_id, invoice_id, action, outcome, decline_category, counted_failure, card_identity_id, payer_ip)
    values (c, p, i1, 'authorize', 'declined', 'invalid_cvv', true, card1, '203.0.113.5'),
           (c, p, i1, 'authorize', 'declined', 'three_ds_failed', true, card1, '203.0.113.5'),
           (c, p, i1, 'authorize', 'declined', 'insufficient_funds', false, card1, '203.0.113.5'),
           (c, p, i1, 'authorize', 'declined', 'invalid_number', true, card2, '203.0.113.5'),
           (c, p, i1, 'authorize', 'declined', 'invalid_number', true, card3, '203.0.113.5');
  select * into s from public.kd_card_stats(card1, '203.0.113.5', i1, 24, 1, 24);
  assert s.counted_failures = 2, 'counted failures exclude insufficient funds: ' || s.counted_failures;
  assert s.card_attempts = 3, 'card attempts';
  assert s.ip_attempts = 5, 'address attempts';
  assert s.ip_distinct_cards = 2, 'other cards from the address: ' || s.ip_distinct_cards;
  assert s.paid_same_invoice = 0, 'nothing paid yet';

  -- old attempts fall out of the window (the table is append only, so move the clock of a new row instead)
  insert into public.payment_attempts (company_id, payment_id, invoice_id, action, outcome, decline_category, counted_failure, card_identity_id, payer_ip, created_at)
    values (c, p, i1, 'authorize', 'declined', 'invalid_cvv', true, card2, '198.51.100.7', now() - interval '25 hours');
  select * into s from public.kd_card_stats(card2, '198.51.100.7', i1, 24, 1, 24);
  assert s.counted_failures = 1, 'the failure older than the window is not counted: ' || s.counted_failures;
  assert s.ip_attempts = 0, 'an attempt older than the velocity window is not counted';

  -- the same card paid the same invoice: counted for that invoice only
  update public.payments set status = 'failed' where id = p;
  insert into public.payments (company_id, invoice_id, client_id, processor_id, amount, idempotency_key, status, card_identity_id) values (c, i1, cl, 'stripe', 10, 'idem-card-0002', 'created', card1) returning id into p;
  update public.payments set status = 'authorized' where id = p;
  update public.payments set status = 'captured', captured_amount = 10 where id = p;
  select * into s from public.kd_card_stats(card1, '203.0.113.5', i1, 24, 1, 24);
  assert s.paid_same_invoice = 1, 'same card, same invoice';
  select * into s from public.kd_card_stats(card1, '203.0.113.5', i2, 24, 1, 24);
  assert s.paid_same_invoice = 0, 'other invoices are not affected';
  select * into s from public.kd_card_stats(card2, '203.0.113.5', i1, 24, 1, 24);
  assert s.paid_same_invoice = 0, 'other cards are not affected';
  select * into s from public.kd_card_stats(null, '203.0.113.5', i1, 24, 1, 24);
  assert s.counted_failures = 0 and s.card_attempts = 0 and s.ip_attempts = 5, 'unknown card: only address counts';

  -- the blocked list is unique per processor and card
  insert into public.card_blacklist (processor_id, identity_hmac, reason) values ('stripe', repeat('a', 64), 'fraud');
  begin insert into public.card_blacklist (processor_id, identity_hmac, reason) values ('stripe', repeat('a', 64), 'again'); assert false, 'blacklist twice';
  exception when unique_violation then null; end;
  begin insert into public.card_blacklist (processor_id, identity_hmac, reason) values ('stripe', 'not-a-hash', 'x'); assert false, 'blacklist needs an HMAC';
  exception when check_violation then null; end;
end
$$;
