-- path: migrations/S06_004_blog_down.sql
drop function if exists public.kd_blog_release_due();
drop function if exists public.kd_blog_view(text);
drop table if exists public.blog_post_versions;
drop table if exists public.blog_post_tags;
drop table if exists public.blog_posts;
drop table if exists public.blog_tags;
drop table if exists public.blog_categories;
drop table if exists public.blog_authors;
drop function if exists public.blog_post_history();
