-- path: sql/assertions/s07_007_admin_people.sql
-- Admin actions: known actions only, a reason is required, one open action per subject; notes are length checked.
do $$
declare
  s uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
begin
  insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('tenant.suspend', 'tenant', s, 'Repeated chargebacks reported', u);
  begin insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('tenant.suspend', 'tenant', s, 'Second request for the same one', u); assert false, 'one open action per subject';
  exception when unique_violation then null; end;
  begin insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('tenant.delete', 'tenant', gen_random_uuid(), 'Remove everything now please', u); assert false, 'unknown action';
  exception when check_violation then null; end;
  begin insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('user.suspend', 'user', gen_random_uuid(), 'short', u); assert false, 'reason needed';
  exception when check_violation then null; end;
  update public.admin_actions set status = 'applied' where subject_id = s;
  insert into public.admin_actions (action, subject_type, subject_id, reason, requested_by) values ('tenant.reactivate', 'tenant', s, 'Issue was resolved with the owner', u);
  begin insert into public.admin_notes (subject_type, subject_id, author_id, body) values ('user', s, u, ''); assert false, 'empty note';
  exception when check_violation then null; end;
  insert into public.admin_notes (subject_type, subject_id, author_id, body) values ('user', s, u, 'Called the owner.');
  assert not has_table_privilege('authenticated', 'public.admin_actions', 'select'), 'closed to clients';
end
$$;
