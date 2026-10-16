-- path: sql/assertions/s06_002_cms.sql
-- CMS: draft in place, publish and archive, schedule and release, approval states, content fixed after draft, revert.
do $$
declare
  r jsonb; v1 uuid; v2 uuid; s text; n int; rec record;
  blocks jsonb := '[{"id":"a","type":"cta"}]'::jsonb;
  blocks2 jsonb := '[{"id":"b","type":"cta"}]'::jsonb;
begin
  r := public.kd_cms_save_draft('about', 'page', 'About us page', 'A description that is long enough to pass.', blocks, null, null);
  assert (r->>'created')::boolean and (r->>'versionNo')::int = 1, 'first draft creates the page';
  v1 := (r->>'versionId')::uuid;
  r := public.kd_cms_save_draft('about', 'page', 'About us page v2', 'A description that is long enough to pass.', blocks2, null, 'edit');
  assert not (r->>'created')::boolean and (r->>'versionId')::uuid = v1, 'the draft is changed in place';
  assert (select title from public.cms_page_versions where id = v1) = 'About us page v2', 'draft content changed';
  begin perform public.kd_cms_save_draft('Bad Slug', 'page', 'Title here', 'A description that is long enough to pass.', blocks, null, null); assert false, 'slug checked';
  exception when check_violation then null; end;
  begin perform public.kd_cms_save_draft('x', 'page', 'Title here', 'A description that is long enough to pass.', '[]'::jsonb, null, null); assert false, 'at least one block';
  exception when check_violation then null; end;

  s := public.kd_cms_publish(v1, null);
  assert s = 'published', 'publish now';
  assert (select live_version_id from public.cms_pages where slug = 'about') = v1, 'live version recorded';
  begin update public.cms_page_versions set title = 'Changed after publish' where id = v1; assert false, 'content fixed after publish';
  exception when invalid_parameter_value then null; end;
  update public.cms_page_versions set note = 'only a note' where id = v1;

  r := public.kd_cms_save_draft('about', 'page', 'About us page v3', 'A description that is long enough to pass.', blocks, null, null);
  assert (r->>'versionNo')::int = 2 and (r->>'created')::boolean, 'new draft after publish gets the next number';
  v2 := (r->>'versionId')::uuid;
  assert public.kd_cms_mark_pending(v2, public.uuid_generate_v7(), null), 'waiting for approval';
  begin perform public.kd_cms_save_draft('about', 'page', 'About us page v4', 'A description that is long enough to pass.', blocks, null, null); assert false, 'no edits while waiting';
  exception when invalid_parameter_value then null; end;
  assert public.kd_cms_to_draft(v2), 'rejected request goes back to draft';
  s := public.kd_cms_publish(v2, now() + interval '1 hour');
  assert s = 'scheduled', 'scheduled';
  select count(*) into n from public.kd_cms_release_due();
  assert n = 0, 'not due yet';
  assert (select status from public.cms_page_versions where id = v1) = 'published', 'old version stays live until the time';
  update public.cms_page_versions set publish_at = now() - interval '1 minute' where id = v2;
  select * into rec from public.kd_cms_release_due() as slug;
  assert rec.slug = 'about', 'released page is reported';
  assert (select status from public.cms_page_versions where id = v1) = 'archived', 'old version archived';
  assert (select status from public.cms_page_versions where id = v2) = 'published' and (select live_version_id from public.cms_pages where slug = 'about') = v2, 'new version live';
  begin perform public.kd_cms_publish(v2, null); assert false, 'published version cannot be published again';
  exception when invalid_parameter_value then null; end;
  begin perform public.kd_cms_publish(public.uuid_generate_v7(), null); assert false, 'unknown version';
  exception when no_data_found then null; end;

  r := public.kd_cms_revert('about', 1, null);
  assert (r->>'versionNo')::int = 3 and (select note from public.cms_page_versions where id = (r->>'versionId')::uuid) = 'Reverted to version 1', 'revert makes a new draft';
  assert (select title from public.cms_page_versions where id = (r->>'versionId')::uuid) = 'About us page v2', 'draft holds the old content';
  begin perform public.kd_cms_revert('about', 99, null); assert false, 'unknown version number';
  exception when no_data_found then null; end;
  assert not has_table_privilege('authenticated', 'public.cms_page_versions', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_cms_publish(uuid, timestamptz)', 'execute'), 'service role only';
end
$$;
