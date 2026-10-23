-- path: sql/assertions/s08_003_client_privacy.sql
-- Privacy requests: one open request per client; anonymize removes personal data and keeps numbers.
do $$
declare
  c uuid; c2 uuid; k uuid; u uuid := gen_random_uuid(); r public.clients%rowtype;
begin
  insert into public.companies (name, slug) values ('Privacy Co', 'privacy-co') returning id into c;
  insert into public.companies (name, slug) values ('Privacy Two', 'privacy-two') returning id into c2;
  insert into public.clients (company_id, name, email, phone, tax_id, notes, tags, billing_line1, billing_postal_code, billing_country, opening_balance, outstanding_balance)
  values (c, 'Jane Roe', 'jane@roe.test', '555', 'TX-9', 'Secret note', array['vip'], '1 Main St', '12345', 'US', 25.5, 10) returning id into k;
  perform public.kd_client_contacts_replace(c, k, '[{"name":"Jane","email":"jane@roe.test"}]'::jsonb);
  insert into public.client_activity (company_id, client_id, kind, title, body) values (c, k, 'note', 'Call', 'Jane said she is moving');

  insert into public.client_privacy_requests (company_id, client_id, kind, reason, requested_by) values (c, k, 'anonymize', 'The client asked us to remove their data', u);
  begin insert into public.client_privacy_requests (company_id, client_id, kind, reason, requested_by) values (c, k, 'delete', 'Second request for the same client', u); assert false, 'one open request';
  exception when unique_violation then null; end;
  begin insert into public.client_privacy_requests (company_id, client_id, kind, reason, requested_by) values (c, k, 'wipe', 'Unknown kind of request here', u); assert false, 'known kinds';
  exception when check_violation then null; end;
  begin insert into public.client_privacy_requests (company_id, client_id, kind, reason, requested_by) values (c, k, 'delete', 'short', u); assert false, 'reason needed';
  exception when check_violation then null; end;

  begin perform public.kd_client_anonymize(c2, k, false, u); assert false, 'another company cannot anonymize';
  exception when sqlstate '22023' then null; end;
  perform public.kd_client_anonymize(c, k, false, u);
  select * into r from public.clients where id = k;
  assert r.name like 'Anonymized client %' and r.email is null and r.phone = '' and r.tax_id = '' and r.notes = '' and r.billing_line1 = '' and r.billing_postal_code = '', 'personal data removed';
  assert r.tags = '{}' and r.do_not_contact and r.anonymized_at is not null, 'flags set';
  assert r.billing_country = 'US' and r.opening_balance = 25.5 and r.outstanding_balance = 10, 'numbers and country stay';
  assert r.deleted_at is null, 'anonymize alone keeps the record';
  assert (select count(*) from public.client_contacts where client_id = k and deleted_at is null) = 0, 'contacts removed';
  assert (select body from public.client_activity where client_id = k and kind = 'note') = '[removed]', 'history text removed';
  begin perform public.kd_client_anonymize(c, k, false, u); assert false, 'only once';
  exception when sqlstate '22023' then null; end;
end
$$;
