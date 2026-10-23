-- path: sql/assertions/s09_006_invoice_snapshots.sql
-- Snapshots are append only; one snapshot per invoice and reason (except manual); the hash has the right length.
do $$
declare
  c uuid; inv uuid; snap uuid;
begin
  insert into public.companies (name, slug) values ('Snap Co', 'snap-co') returning id into c;
  insert into public.invoices (company_id, walk_in_name) values (c, 'Walk-in') returning id into inv;
  insert into public.invoice_snapshots (company_id, invoice_id, file_id, content_hash, size_bytes, data)
    values (c, inv, public.uuid_generate_v7(), repeat('a', 64), 1200, '{}') returning id into snap;
  begin insert into public.invoice_snapshots (company_id, invoice_id, file_id, content_hash, size_bytes, data) values (c, inv, public.uuid_generate_v7(), repeat('b', 64), 10, '{}'); assert false, 'one sent snapshot per invoice';
  exception when unique_violation then null; end;
  begin insert into public.invoice_snapshots (company_id, invoice_id, file_id, content_hash, size_bytes, data) values (c, inv, public.uuid_generate_v7(), 'short', 10, '{}'); assert false, 'hash length';
  exception when check_violation then null; end;
  begin update public.invoice_snapshots set size_bytes = 5 where id = snap; assert false, 'append only (update)';
  exception when insufficient_privilege then null; end;
  begin delete from public.invoice_snapshots where id = snap; assert false, 'append only (delete)';
  exception when insufficient_privilege then null; end;
end $$;
