-- path: sql/assertions/s06_003_legal.sql
-- Legal acceptance log: one row per subject, document and version; never changed or deleted; closed to clients.
do $$
declare
  id1 uuid;
begin
  assert public.kd_legal_accept('visitor:aaaaaaaa', null, 'terms', 'v3', 'h1') = true, 'first acceptance is stored';
  assert public.kd_legal_accept('visitor:aaaaaaaa', null, 'terms', 'v3', 'h2') = false, 'same version is stored once';
  assert public.kd_legal_accept('visitor:aaaaaaaa', null, 'terms', 'v4', 'h1') = true, 'a new version is stored again';
  select id into id1 from public.legal_acceptances where subject = 'visitor:aaaaaaaa' and document_version = 'v3';
  begin update public.legal_acceptances set document_version = 'v9' where id = id1; assert false, 'version cannot change';
  exception when sqlstate '22023' then null; end;
  begin delete from public.legal_acceptances where id = id1; assert false, 'record cannot be deleted';
  exception when sqlstate '22023' then null; end;
  begin insert into public.legal_acceptances (subject, document_slug, document_version) values ('x', 'terms', 'v1'); assert false, 'subject length';
  exception when check_violation then null; end;
  begin insert into public.legal_acceptances (subject, document_slug, document_version) values ('visitor:bbbbbbbb', 'Bad Slug', 'v1'); assert false, 'slug checked';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.legal_acceptances', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_legal_accept(text, uuid, text, text, text)', 'execute'), 'service role only';
end
$$;
