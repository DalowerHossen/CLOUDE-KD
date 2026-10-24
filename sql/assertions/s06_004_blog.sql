-- path: sql/assertions/s06_004_blog.sql
-- Blog: slug rules, edit history, view counter, scheduled release, full-text search, closed to clients.
do $$
declare
  a uuid;
  p uuid;
  slugs text[];
begin
  insert into public.blog_authors (slug, name) values ('jane-doe', 'Jane Doe') returning id into a;
  begin insert into public.blog_authors (slug, name) values ('Bad Slug', 'X Y'); assert false, 'slug checked';
  exception when check_violation then null; end;
  begin insert into public.blog_authors (slug, name) values ('jane-doe', 'Other Person'); assert false, 'slug is unique';
  exception when unique_violation then null; end;
  insert into public.blog_posts (slug, title, excerpt, body_html, body_text, author_id) values ('first-post', 'First post', 'About invoices', '<p>Invoice text</p>', 'Invoice text about payroll', a) returning id into p;
  assert (select count(*) from public.blog_post_versions where post_id = p) = 0, 'no history before a change';
  update public.blog_posts set body_html = '<p>Changed</p>' where id = p;
  assert (select count(*) from public.blog_post_versions where post_id = p) = 1, 'a change keeps the earlier text';
  update public.blog_posts set featured = true where id = p;
  assert (select count(*) from public.blog_post_versions where post_id = p) = 1, 'other fields keep no history';
  assert public.kd_blog_view('first-post') = false, 'drafts are not counted';
  update public.blog_posts set status = 'published', published_at = now() where id = p;
  assert public.kd_blog_view('first-post') = true, 'published posts are counted';
  assert (select view_count from public.blog_posts where id = p) = 1, 'one view';
  assert (select count(*) from public.blog_posts where search @@ plainto_tsquery('english', 'payroll')) = 1, 'full-text search finds body text';
  update public.blog_posts set status = 'scheduled', publish_at = now() - interval '1 minute', published_at = null where id = p;
  select array_agg(s) into slugs from public.kd_blog_release_due() s;
  assert slugs = array['first-post'], 'due post is released';
  assert (select status from public.blog_posts where id = p) = 'published', 'released post is published';
  begin insert into public.blog_posts (slug, title, author_id, status) values ('x-post', 'X post', a, 'archived'); assert false, 'status checked';
  exception when check_violation then null; end;
  assert not has_table_privilege('authenticated', 'public.blog_posts', 'select'), 'closed to clients';
  assert not has_function_privilege('authenticated', 'public.kd_blog_view(text)', 'execute'), 'service role only';
end
$$;
