-- path: sql/assertions/s16_035_release_notes.sql
-- A note needs a title and a body, known kinds, at most 8 tour steps; one read record per person and note; both tables are closed
-- to clients.
do $$
declare
  u uuid := gen_random_uuid();
  n uuid;
  c uuid;
begin
  insert into public.release_notes (title, body, created_by) values ('Faster invoice list', 'The list now opens in under a second.', u) returning id into n;
  begin insert into public.release_notes (title, body, created_by) values ('x', 'Short title is refused.', u); assert false, 'title length';
  exception when check_violation then null; end;
  begin insert into public.release_notes (title, body, kind, created_by) values ('Unknown kind', 'Kinds are fixed.', 'news', u); assert false, 'known kinds';
  exception when check_violation then null; end;
  begin insert into public.release_notes (title, body, tour, created_by) values ('Too many steps', 'A tour has at most eight steps.', '[1,2,3,4,5,6,7,8,9]', u); assert false, 'tour length';
  exception when check_violation then null; end;
  begin insert into public.release_notes (title, body, tour, created_by) values ('Tour is a list', 'An object is not a list of steps.', '{}', u); assert false, 'tour type';
  exception when check_violation then null; end;
  select id into c from public.companies where deleted_at is null limit 1;
  if c is not null then
    insert into public.release_note_reads (company_id, user_id, note_id) values (c, u, n);
    begin insert into public.release_note_reads (company_id, user_id, note_id) values (c, u, n); assert false, 'one read per person and note';
    exception when unique_violation then null; end;
  end if;
  assert not has_table_privilege('authenticated', 'public.release_notes', 'select'), 'notes closed';
  assert not has_table_privilege('authenticated', 'public.release_note_reads', 'select'), 'reads closed';
end $$;
