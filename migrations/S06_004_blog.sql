-- path: migrations/S06_004_blog.sql
-- STEP 06.5 Blog: authors, categories, tags, posts, post tags and the edit history of posts.

create table if not exists public.blog_authors (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name text not null check (char_length(name) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 600),
  avatar_file_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.blog_categories (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.blog_tags (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name text not null check (char_length(name) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.blog_posts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  title text not null check (char_length(title) between 3 and 120),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  body_html text not null default '' check (char_length(body_html) <= 200000),
  body_text text not null default '' check (char_length(body_text) <= 200000),
  cover_file_id uuid,
  cover_alt text not null default '' check (char_length(cover_alt) <= 160),
  author_id uuid not null references public.blog_authors (id) on delete restrict,
  category_id uuid references public.blog_categories (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'scheduled', 'published')),
  publish_at timestamptz,
  published_at timestamptz,
  approval_request_id uuid,
  featured boolean not null default false,
  seo_title text not null default '' check (char_length(seo_title) <= 70),
  seo_description text not null default '' check (char_length(seo_description) <= 170),
  read_minutes integer not null default 1 check (read_minutes between 1 and 120),
  view_count bigint not null default 0 check (view_count >= 0),
  search tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(body_text, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.blog_post_tags (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  post_id uuid not null references public.blog_posts (id) on delete restrict,
  tag_id uuid not null references public.blog_tags (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.blog_post_versions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  post_id uuid not null references public.blog_posts (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  title text not null,
  excerpt text not null,
  body_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.blog_authors');
select public.apply_standard_triggers('public.blog_categories');
select public.apply_standard_triggers('public.blog_tags');
select public.apply_standard_triggers('public.blog_posts');
select public.apply_standard_triggers('public.blog_post_tags');
select public.apply_standard_triggers('public.blog_post_versions');
select public.rls_enable_default_deny('public.blog_authors');
select public.rls_enable_default_deny('public.blog_categories');
select public.rls_enable_default_deny('public.blog_tags');
select public.rls_enable_default_deny('public.blog_posts');
select public.rls_enable_default_deny('public.blog_post_tags');
select public.rls_enable_default_deny('public.blog_post_versions');
select public.audit_enable_for('public.blog_authors');
select public.audit_enable_for('public.blog_categories');
select public.audit_enable_for('public.blog_tags');
select public.audit_enable_for('public.blog_posts');
select public.audit_enable_for('public.blog_post_tags');

create unique index if not exists uq_blog_author_slug on public.blog_authors (slug) where deleted_at is null;
create unique index if not exists uq_blog_category_slug on public.blog_categories (slug) where deleted_at is null;
create unique index if not exists uq_blog_tag_slug on public.blog_tags (slug) where deleted_at is null;
create unique index if not exists uq_blog_post_slug on public.blog_posts (slug) where deleted_at is null;
create unique index if not exists uq_blog_post_tag on public.blog_post_tags (post_id, tag_id) where deleted_at is null;
create unique index if not exists uq_blog_post_version on public.blog_post_versions (post_id, version_no);
create index if not exists ix_blog_published on public.blog_posts (published_at desc) where status = 'published' and deleted_at is null;
create index if not exists ix_blog_scheduled on public.blog_posts (publish_at) where status = 'scheduled' and deleted_at is null;
create index if not exists ix_blog_category on public.blog_posts (category_id) where deleted_at is null;
create index if not exists ix_blog_search on public.blog_posts using gin (search);
create index if not exists ix_blog_tag_post on public.blog_post_tags (tag_id) where deleted_at is null;

revoke all on public.blog_authors, public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_tags, public.blog_post_versions from authenticated;
grant all on public.blog_authors, public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_tags, public.blog_post_versions to service_role;

-- Keeps the earlier text of a post whenever the title, summary or body changes.
create or replace function public.blog_post_history() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.title is distinct from old.title or new.excerpt is distinct from old.excerpt or new.body_html is distinct from old.body_html then
    insert into public.blog_post_versions (post_id, version_no, title, excerpt, body_html)
    values (old.id, coalesce((select max(version_no) from public.blog_post_versions where post_id = old.id), 0) + 1, old.title, old.excerpt, old.body_html);
  end if;
  return new;
end
$$;
drop trigger if exists trg_blog_post_history on public.blog_posts;
create trigger trg_blog_post_history before update on public.blog_posts
  for each row execute function public.blog_post_history();

-- Counts one view of a published post. No visitor data is stored.
create or replace function public.kd_blog_view(p_slug text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.blog_posts set view_count = view_count + 1 where slug = p_slug and status = 'published' and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Publishes scheduled posts that are due and answers their slugs.
create or replace function public.kd_blog_release_due() returns setof text
language plpgsql security definer
set search_path = public
as $$
declare
  v record;
begin
  for v in select id, slug from public.blog_posts where status = 'scheduled' and publish_at <= now() and deleted_at is null order by publish_at for update skip locked loop
    update public.blog_posts set status = 'published', published_at = now(), publish_at = null where id = v.id;
    return next v.slug;
  end loop;
end
$$;

revoke all on function public.kd_blog_view(text), public.kd_blog_release_due() from public, anon, authenticated;
grant execute on function public.kd_blog_view(text), public.kd_blog_release_due() to service_role;
