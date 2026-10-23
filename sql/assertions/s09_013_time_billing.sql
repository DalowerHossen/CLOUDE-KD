-- path: sql/assertions/s09_013_time_billing.sql
-- Billing time: an hour is claimed once, only approved billable time can be claimed, claims are linked and released.
do $$
declare
  c uuid; cl uuid; p uuid; u uuid := gen_random_uuid(); a uuid; b uuid; d uuid; inv uuid; n integer; claimed uuid[];
begin
  insert into public.companies (name, slug) values ('Bill Co', 'bill-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer') returning id into cl;
  insert into public.projects (company_id, client_id, name, default_rate) values (c, cl, 'Web', 100) returning id into p;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours, rate, status) values (c, p, u, current_date, 2, 100, 'approved') returning id into a;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours, rate, status) values (c, p, u, current_date, 1, 100, 'approved') returning id into b;
  insert into public.time_entries (company_id, project_id, user_id, work_date, hours, rate, status, billable) values (c, p, u, current_date, 1, 100, 'approved', false) returning id into d;

  select array_agg(x) into claimed from public.kd_time_claim(c, array[a, b, d]) x;
  assert array_length(claimed, 1) = 2, 'only billable approved time is claimed';
  select array_agg(x) into claimed from public.kd_time_claim(c, array[a, b]) x;
  assert claimed is null, 'claimed time cannot be claimed again';
  insert into public.invoices (company_id, client_id) values (c, cl) returning id into inv;
  n := public.kd_time_link(c, array[a, b], inv);
  assert n = 2 and (select count(*) from public.time_entries where invoice_id = inv) = 2, 'linked to the invoice';
  assert public.kd_time_release(c, inv, null) = 2, 'a voided invoice gives its time back';
  assert (select count(*) from public.time_entries where company_id = c and status = 'approved' and invoice_id is null) = 3;
  select array_agg(x) into claimed from public.kd_time_claim(c, array[a]) x;
  assert array_length(claimed, 1) = 1;
  assert public.kd_time_release(c, null, array[a]) = 1, 'a claim without an invoice can be released';
  select array_agg(x) into claimed from public.kd_time_claim(c, array[a]) x;
  assert public.kd_time_release_stale() = 0, 'a fresh claim is not stale';
  set local session_replication_role = replica;
  update public.time_entries set updated_at = now() - interval '2 hours' where id = a;
  set local session_replication_role = origin;
  assert public.kd_time_release_stale() = 1, 'an old claim is released';
end
$$;
