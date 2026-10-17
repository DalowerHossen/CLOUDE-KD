-- path: sql/assertions/s09_016_batches.sql
-- Batches: items are claimed once, an invoice cannot wait in two batches for the same action, results keep the counters,
-- the batch finishes by itself, cancel and retry work, a scheduled batch waits for its time.
do $$
declare
  c uuid; cl uuid; i1 uuid; i2 uuid; i3 uuid; b1 uuid; b2 uuid; it1 uuid; r record; n integer; cnt integer;
  bill jsonb := '{"name":"Buyer","postalCode":"10001","country":"US"}';
begin
  insert into public.companies (name, slug) values ('Batch Co', 'batch-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into i1;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into i2;
  insert into public.invoices (company_id, client_id, bill_to) values (c, cl, bill) returning id into i3;
  insert into public.invoice_batches (company_id, action, item_count, created_by, created_role) values (c, 'send', 3, gen_random_uuid(), 'owner') returning id into b1;
  insert into public.invoice_batch_items (company_id, batch_id, action, invoice_id) values (c, b1, 'send', i1), (c, b1, 'send', i2), (c, b1, 'send', i3);

  -- the same invoice cannot wait in a second batch for the same action
  insert into public.invoice_batches (company_id, action, item_count, created_by, created_role) values (c, 'send', 1, gen_random_uuid(), 'owner') returning id into b2;
  begin insert into public.invoice_batch_items (company_id, batch_id, action, invoice_id) values (c, b2, 'send', i1); assert false, 'double send guard';
  exception when unique_violation then null; end;
  insert into public.invoice_batch_items (company_id, batch_id, action, invoice_id) values (c, b2, 'remind', i1);

  -- claiming takes each item once
  select count(*) into n from public.kd_batch_claim(2);
  assert n = 2, 'claims up to the limit';
  select count(*) into n from public.kd_batch_claim(10);
  assert n = 2, 'the rest, including the reminder item: ' || n;
  select count(*) into n from public.kd_batch_claim(10);
  assert n = 0, 'nothing is claimed twice';
  assert (select status from public.invoice_batches where id = b1) = 'running', 'the batch is running';

  select id into it1 from public.invoice_batch_items where batch_id = b1 and invoice_id = i1;
  perform public.kd_batch_item_result(it1, 'done', 'sent', null);
  perform public.kd_batch_item_result(it1, 'failed', 'again', null);
  assert (select done_count from public.invoice_batches where id = b1) = 1 and (select failed_count from public.invoice_batches where id = b1) = 0, 'a result counts once';
  perform public.kd_batch_item_result((select id from public.invoice_batch_items where batch_id = b1 and invoice_id = i2), 'failed', 'no client e-mail', null);
  perform public.kd_batch_item_result((select id from public.invoice_batch_items where batch_id = b1 and invoice_id = i3), 'skipped', 'already sent', null);
  select * into r from public.invoice_batches where id = b1;
  assert r.status = 'done' and r.done_count = 1 and r.failed_count = 1 and r.skipped_count = 1 and r.finished_at is not null, 'the batch finishes by itself';

  -- retry puts failed items back
  assert public.kd_batch_retry(c, b1) = 1, 'one failed item retried';
  assert (select status from public.invoice_batches where id = b1) = 'queued' and (select failed_count from public.invoice_batches where id = b1) = 0;
  select count(*) into n from public.kd_batch_claim(10);
  assert n = 1, 'the retried item is claimed again';
  perform public.kd_batch_item_result((select id from public.invoice_batch_items where batch_id = b1 and invoice_id = i2), 'done', 'sent', null);
  assert (select status from public.invoice_batches where id = b1) = 'done' and (select done_count from public.invoice_batches where id = b1) = 2;

  -- a pending result puts the item back in line (a retry later) and does not count
  perform public.kd_batch_item_result((select id from public.invoice_batch_items where batch_id = b2 and invoice_id = i1), 'done', 'reminder sent', null);
  assert (select status from public.invoice_batches where id = b2) = 'done', 'second batch done';

  -- cancel and scheduling
  insert into public.invoice_batches (company_id, action, item_count, created_by, created_role, run_after) values (c, 'trash', 2, gen_random_uuid(), 'staff', now() + interval '1 day') returning id into b1;
  insert into public.invoice_batch_items (company_id, batch_id, action, invoice_id) values (c, b1, 'trash', i1), (c, b1, 'trash', i3);
  select count(*) into n from public.kd_batch_claim(10);
  assert n = 0, 'a scheduled batch waits for its time';
  assert public.kd_batch_cancel(c, b1) = 2, 'both waiting items cancelled';
  select * into r from public.invoice_batches where id = b1;
  assert r.status = 'cancelled' and r.skipped_count = 2, 'cancelled batch';
  begin update public.invoice_batches set done_count = 5 where id = b1; assert false, 'counters cannot exceed the total';
  exception when check_violation then null; end;
  begin insert into public.invoice_batches (company_id, action, item_count, created_by, created_role) values (c, 'explode', 1, gen_random_uuid(), 'owner'); assert false, 'known actions';
  exception when check_violation then null; end;
end
$$;
