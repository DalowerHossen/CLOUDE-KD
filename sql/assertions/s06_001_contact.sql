-- path: sql/assertions/s06_001_contact.sql
-- Contact messages: checks on address, topic and length; purge after 24 months; closed to clients.
do $$
declare
  id1 uuid;
begin
  insert into public.contact_messages (name, email, topic, message) values ('Jane', 'jane@example.com', 'sales', 'Hello, I would like a demo.') returning id into id1;
  begin insert into public.contact_messages (name, email, topic, message) values ('Jane', 'Jane@Example.com', 'sales', 'Hello, I would like a demo.'); assert false, 'address must be lower case';
  exception when check_violation then null; end;
  begin insert into public.contact_messages (name, email, topic, message) values ('Jane', 'not-an-address', 'sales', 'Hello, I would like a demo.'); assert false, 'address checked';
  exception when check_violation then null; end;
  begin insert into public.contact_messages (name, email, topic, message) values ('Jane', 'jane@example.com', 'billing', 'Hello, I would like a demo.'); assert false, 'topic checked';
  exception when check_violation then null; end;
  begin insert into public.contact_messages (name, email, topic, message) values ('Jane', 'jane@example.com', 'sales', 'short'); assert false, 'message length';
  exception when check_violation then null; end;
  begin insert into public.contact_messages (name, email, topic, message, status) values ('Jane', 'jane@example.com', 'sales', 'Hello, I would like a demo.', 'archived'); assert false, 'status checked';
  exception when check_violation then null; end;
  update public.contact_messages set created_at = now() - interval '25 months' where id = id1;
  assert public.kd_contact_purge() = 1, 'old messages are removed';
  assert not exists (select 1 from public.contact_messages where id = id1 and deleted_at is null), 'removed from view';
  assert not has_table_privilege('authenticated', 'public.contact_messages', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_contact_purge()', 'execute'), 'service role only';
end
$$;
