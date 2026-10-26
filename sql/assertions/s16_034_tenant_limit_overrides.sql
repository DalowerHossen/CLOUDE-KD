-- path: sql/assertions/s16_034_tenant_limit_overrides.sql
-- One override per company and feature; booleans, numbers and null (no limit) are accepted, text and negative numbers are not;
-- the table is closed to clients.
do $$
declare
  u uuid := gen_random_uuid();
  c uuid;
begin
  select id into c from public.companies where deleted_at is null limit 1;
  if c is not null then
    insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'clients.max', '5000', 'Agreed in the enterprise deal', u);
    insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'api.access', 'true', 'Pilot of the public API', u);
    insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'storage.gigabytes', 'null', 'No storage limit for this partner', u);
    begin insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'clients.max', '6000', 'A second override for the same feature', u); assert false, 'one override per feature';
    exception when unique_violation then null; end;
    begin insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'staff.seats', '"ten"', 'Text is not a limit', u); assert false, 'value type';
    exception when check_violation then null; end;
    begin insert into public.tenant_limit_overrides (company_id, entitlement_key, value, reason, set_by) values (c, 'staff.seats', '-1', 'Negative is not a limit', u); assert false, 'not negative';
    exception when check_violation then null; end;
  end if;
  assert not has_table_privilege('authenticated', 'public.tenant_limit_overrides', 'select'), 'closed to clients';
end $$;
