-- path: migrations/S06_002_cms.sql
-- STEP 06.3 CMS: pages and their versions. Content of a version is fixed once it leaves "draft".

create table if not exists public.cms_pages (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?(/[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?){0,2}$'),
  kind text not null default 'page' check (kind in ('page', 'legal', 'help')),
  live_version_id uuid,
  noindex boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.cms_page_versions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  page_id uuid not null references public.cms_pages (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 20 and 300),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) between 1 and 40),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  published_at timestamptz,
  approval_request_id uuid,
  author_id uuid,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.cms_pages');
select public.apply_standard_triggers('public.cms_page_versions');
select public.rls_enable_default_deny('public.cms_pages');
select public.rls_enable_default_deny('public.cms_page_versions');
select public.audit_enable_for('public.cms_pages');
select public.audit_enable_for('public.cms_page_versions');

create unique index if not exists uq_cms_slug on public.cms_pages (slug) where deleted_at is null;
create unique index if not exists uq_cms_version_no on public.cms_page_versions (page_id, version_no);
-- One unfinished version per page, and one published version per page.
create unique index if not exists uq_cms_open_version on public.cms_page_versions (page_id) where deleted_at is null and status in ('draft', 'pending_approval', 'scheduled');
create unique index if not exists uq_cms_published on public.cms_page_versions (page_id) where deleted_at is null and status = 'published';
create index if not exists ix_cms_scheduled on public.cms_page_versions (publish_at) where status = 'scheduled' and deleted_at is null;

revoke all on public.cms_pages, public.cms_page_versions from authenticated;
grant all on public.cms_pages, public.cms_page_versions to service_role;

-- The content of a version cannot change after it left "draft".
create or replace function public.cms_version_content_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and (new.title is distinct from old.title or new.description is distinct from old.description or new.blocks is distinct from old.blocks) then
    raise exception 'content of a version is fixed after the draft stage' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists trg_cms_version_content on public.cms_page_versions;
create trigger trg_cms_version_content before update on public.cms_page_versions
  for each row execute function public.cms_version_content_guard();

-- Saves the draft of a page: creates the page and the draft when needed, otherwise changes the draft in place.
-- Refuses while a version waits for approval or is scheduled (cancel it first).
create or replace function public.kd_cms_save_draft(p_slug text, p_kind text, p_title text, p_description text, p_blocks jsonb, p_author uuid, p_note text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pg public.cms_pages%rowtype;
  open_v public.cms_page_versions%rowtype;
  next_no integer;
  vid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('cms:' || p_slug, 0));
  select * into pg from public.cms_pages where slug = p_slug and deleted_at is null;
  if not found then
    insert into public.cms_pages (slug, kind) values (p_slug, p_kind) returning * into pg;
  end if;
  select * into open_v from public.cms_page_versions where page_id = pg.id and deleted_at is null and status in ('draft', 'pending_approval', 'scheduled');
  if found and open_v.status <> 'draft' then
    raise exception 'a version is waiting for approval or scheduled' using errcode = '22023';
  end if;
  if found then
    update public.cms_page_versions set title = p_title, description = p_description, blocks = p_blocks, author_id = p_author, note = p_note where id = open_v.id;
    return jsonb_build_object('pageId', pg.id, 'versionId', open_v.id, 'versionNo', open_v.version_no, 'created', false);
  end if;
  select coalesce(max(version_no), 0) + 1 into next_no from public.cms_page_versions where page_id = pg.id;
  insert into public.cms_page_versions (page_id, version_no, title, description, blocks, author_id, note)
  values (pg.id, next_no, p_title, p_description, p_blocks, p_author, p_note) returning id into vid;
  return jsonb_build_object('pageId', pg.id, 'versionId', vid, 'versionNo', next_no, 'created', true);
end
$$;

-- Makes a draft live now (p_publish_at null) or at a later time. The earlier live version is archived.
create or replace function public.kd_cms_publish(p_version uuid, p_publish_at timestamptz) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v public.cms_page_versions%rowtype;
begin
  select * into v from public.cms_page_versions where id = p_version and deleted_at is null for update;
  if not found then raise exception 'version not found' using errcode = 'P0002'; end if;
  if v.status not in ('draft', 'pending_approval') then raise exception 'version cannot be published' using errcode = '22023'; end if;
  if p_publish_at is not null and p_publish_at > now() + interval '1 minute' then
    update public.cms_page_versions set status = 'scheduled', publish_at = p_publish_at where id = v.id;
    return 'scheduled';
  end if;
  update public.cms_page_versions set status = 'archived' where page_id = v.page_id and status = 'published' and deleted_at is null;
  update public.cms_page_versions set status = 'published', published_at = now(), publish_at = null where id = v.id;
  update public.cms_pages set live_version_id = v.id where id = v.page_id;
  return 'published';
end
$$;

create or replace function public.kd_cms_mark_pending(p_version uuid, p_request uuid, p_publish_at timestamptz) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.cms_page_versions set status = 'pending_approval', approval_request_id = p_request, publish_at = p_publish_at
  where id = p_version and status = 'draft' and deleted_at is null;
  return found;
end
$$;

-- Back to draft: a rejected or withdrawn request, or a scheduled version that is called back.
create or replace function public.kd_cms_to_draft(p_version uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.cms_page_versions set status = 'draft', approval_request_id = null, publish_at = null
  where id = p_version and status in ('pending_approval', 'scheduled') and deleted_at is null;
  return found;
end
$$;

-- Publishes scheduled versions whose time has come. Returns the slugs, so the caller can refresh their pages.
create or replace function public.kd_cms_release_due() returns setof text
language plpgsql security definer
set search_path = public
as $$
declare
  v record;
begin
  for v in select id, page_id from public.cms_page_versions where status = 'scheduled' and publish_at <= now() and deleted_at is null order by publish_at for update skip locked loop
    update public.cms_page_versions set status = 'archived' where page_id = v.page_id and status = 'published' and deleted_at is null;
    update public.cms_page_versions set status = 'published', published_at = now(), publish_at = null where id = v.id;
    update public.cms_pages set live_version_id = v.id where id = v.page_id;
    return next (select slug from public.cms_pages where id = v.page_id);
  end loop;
end
$$;

-- A new draft that starts as a copy of an earlier version (revert). Refused while another unfinished version exists.
create or replace function public.kd_cms_revert(p_slug text, p_version_no integer, p_author uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pg public.cms_pages%rowtype;
  src public.cms_page_versions%rowtype;
begin
  select * into pg from public.cms_pages where slug = p_slug and deleted_at is null;
  if not found then raise exception 'page not found' using errcode = 'P0002'; end if;
  select * into src from public.cms_page_versions where page_id = pg.id and version_no = p_version_no and deleted_at is null;
  if not found then raise exception 'version not found' using errcode = 'P0002'; end if;
  return public.kd_cms_save_draft(p_slug, pg.kind, src.title, src.description, src.blocks, p_author, 'Reverted to version ' || p_version_no);
end
$$;

revoke all on function public.kd_cms_save_draft(text, text, text, text, jsonb, uuid, text), public.kd_cms_publish(uuid, timestamptz),
  public.kd_cms_mark_pending(uuid, uuid, timestamptz), public.kd_cms_to_draft(uuid), public.kd_cms_release_due(),
  public.kd_cms_revert(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.kd_cms_save_draft(text, text, text, text, jsonb, uuid, text), public.kd_cms_publish(uuid, timestamptz),
  public.kd_cms_mark_pending(uuid, uuid, timestamptz), public.kd_cms_to_draft(uuid), public.kd_cms_release_due(),
  public.kd_cms_revert(text, integer, uuid) to service_role;
