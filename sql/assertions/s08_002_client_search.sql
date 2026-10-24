-- path: sql/assertions/s08_002_client_search.sql
-- Search (fuzzy, filters, order, pages), duplicates, merge, saved views and the activity log.
do $$
declare
  c uuid; c2 uuid; a uuid; b uuid; d uuid; e uuid; x uuid;
  n integer; first_page uuid[]; second_page uuid[]; v text; vid uuid;
begin
  insert into public.companies (name, slug) values ('Search Co', 'search-co') returning id into c;
  insert into public.companies (name, slug) values ('Other Search Co', 'other-search-co') returning id into c2;
  insert into public.clients (company_id, name, email, tags, billing_country, tax_id) values (c, 'Acme Trading Ltd', 'info@acme.test', array['vip'], 'US', 'T-1') returning id into a;
  insert into public.clients (company_id, name, email, tags, billing_country, outstanding_balance) values (c, 'Acme Tradng Limited', 'info@acme.test', array['retail'], 'US', 50) returning id into b;
  insert into public.clients (company_id, name, billing_country, outstanding_balance) values (c, 'Zeta Studio', 'DE', 900) returning id into d;
  insert into public.clients (company_id, name, billing_country, status) values (c, 'Beta Works', 'DE', 'archived') returning id into e;
  insert into public.clients (company_id, name) values (c2, 'Acme Foreign') returning id into x;

  -- search: typo tolerant, scoped to the company
  select count(*) into n from public.kd_client_search(c, 'acme', 'active', null, null, null, false, 'name', false, null, null, 25);
  assert n = 2, 'both Acme clients found';
  select count(*) into n from public.kd_client_search(c, 'acmee tradin', null, null, null, null, false, 'name', false, null, null, 25);
  assert n >= 1, 'typo tolerant';
  select count(*) into n from public.kd_client_search(c, null, null, null, null, null, false, 'name', false, null, null, 25);
  assert n = 4, 'foreign company never listed';
  select count(*) into n from public.kd_client_search(c, null, 'archived', null, null, null, false, 'name', false, null, null, 25);
  assert n = 1, 'status filter';
  select count(*) into n from public.kd_client_search(c, null, null, 'vip', null, null, false, 'name', false, null, null, 25);
  assert n = 1, 'tag filter';
  select count(*) into n from public.kd_client_search(c, null, null, null, 'DE', null, true, 'name', false, null, null, 25);
  assert n = 1, 'country with balance filter';
  select count(*) into n from public.kd_client_search(c, '%', null, null, null, null, false, 'name', false, null, null, 25);
  assert n = 0, 'wildcard characters are plain text';

  -- sort by balance descending and keyset pages
  select array_agg(id) into first_page from public.kd_client_search(c, null, null, null, null, null, false, 'balance', true, null, null, 2);
  assert first_page[1] = d, 'highest balance first';
  select sort_value into v from public.kd_client_search(c, null, null, null, null, null, false, 'balance', true, null, null, 2) order by sort_value::numeric desc, id limit 1 offset 1;
  select array_agg(id) into second_page from public.kd_client_search(c, null, null, null, null, null, false, 'balance', true, v, first_page[2], 2);
  assert not (second_page && first_page), 'the next page has no repeated row';
  assert coalesce(array_length(first_page, 1), 0) + coalesce(array_length(second_page, 1), 0) = 4, 'all rows once';

  -- duplicates
  select count(*) into n from public.kd_client_duplicates(c, 'Acme Trading Ltd', 'info@acme.test', null, null);
  assert n >= 2, 'same e-mail and similar name';
  select count(*) into n from public.kd_client_duplicates(c, 'Acme Trading Ltd', 'info@acme.test', null, a);
  assert n = 1, 'the record itself is excluded';
  select count(*) into n from public.kd_client_duplicate_pairs(c, 50);
  assert n = 1, 'one pair';

  -- merge
  perform public.kd_client_contacts_replace(c, a, '[{"name":"Ann","email":"ann@acme.test"}]'::jsonb);
  perform public.kd_client_contacts_replace(c, b, '[{"name":"Bob","email":"bob@acme.test"}]'::jsonb);
  insert into public.client_activity (company_id, client_id, kind, body) values (c, b, 'note', 'Called about the order');
  begin perform public.kd_client_merge(c2, a, b, gen_random_uuid()); assert false, 'another company cannot merge';
  exception when sqlstate '22023' then null; end;
  begin perform public.kd_client_merge(c, a, a, gen_random_uuid()); assert false, 'same client';
  exception when sqlstate '22023' then null; end;
  perform public.kd_client_merge(c, a, b, gen_random_uuid());
  assert (select deleted_at is not null from public.clients where id = b), 'removed client is soft deleted';
  assert (select outstanding_balance from public.clients where id = a) = 50, 'balances added';
  assert (select tags from public.clients where id = a) @> array['vip', 'retail'], 'tags combined';
  assert (select count(*) from public.client_contacts where client_id = a and deleted_at is null) = 2, 'contacts combined';
  assert (select count(*) from public.client_activity where client_id = a and kind = 'note') = 1, 'history moved';
  assert (select count(*) from public.client_merges where kept_client_id = a and removed_client_id = b) = 1, 'merge logged';

  -- saved views
  insert into public.saved_views (company_id, user_id, list_key, name, filters) values (c, gen_random_uuid(), 'clients', 'VIP', '{"tag":"vip"}') returning id into vid;
  begin insert into public.saved_views (company_id, user_id, list_key, name) select c, user_id, 'clients', 'vip' from public.saved_views where id = vid; assert false, 'one name per person and list';
  exception when unique_violation then null; end;
  begin insert into public.client_activity (company_id, client_id, kind) values (c, a, 'note'); assert false, 'activity needs text';
  exception when check_violation then null; end;
  perform public.kd_client_set_balances(c, d, 10, 5, now(), null);
  assert (select outstanding_balance from public.clients where id = d) = 10, 'balances set by the invoice STEP';
  perform public.kd_client_set_balances(c2, d, 99, 0, null, null);
  assert (select outstanding_balance from public.clients where id = d) = 10, 'another company cannot set balances';
end
$$;
