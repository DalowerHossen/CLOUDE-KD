-- path: migrations/S16_005_social.sql
-- STEP 16.4.a Social media.
--   social_accounts        a connected page or profile (Facebook Page, Instagram professional account, Threads profile, or a
--                          sandbox account), with its access token encrypted.
--   social_posts           a post: its text, link and image, where it goes, when, and how it ended. A post moves one way.
--   social_hashtag_groups  saved groups of hashtags the composer can add.

create table if not exists public.social_accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  provider text not null check (provider in ('facebook', 'instagram', 'threads', 'sandbox')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  external_id text not null check (external_id ~ '^[0-9A-Za-z_.-]{1,60}$'),
  access_token_enc jsonb check (access_token_enc is null or jsonb_typeof(access_token_enc) = 'object'),
  token_last4 text check (token_last4 is null or char_length(token_last4) = 4),
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'needs_reconnect')),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_checked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((provider = 'sandbox') = (access_token_enc is null))
);

create table if not exists public.social_posts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.social_accounts (id) on delete restrict,
  body text not null default '' check (char_length(body) <= 5000),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 2000)),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  external_id text check (external_id is null or char_length(external_id) <= 200),
  external_url text check (external_url is null or char_length(external_url) <= 2000),
  container_id text check (container_id is null or char_length(container_id) <= 200),
  publish_after timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (body <> '' or image_url is not null),
  check (status <> 'scheduled' or scheduled_at is not null),
  check ((status = 'published') = (published_at is not null)),
  check (status <> 'published' or external_id is not null)
);

create table if not exists public.social_hashtag_groups (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  tags text[] not null check (cardinality(tags) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.social_accounts');
select public.apply_standard_triggers('public.social_posts');
select public.apply_standard_triggers('public.social_hashtag_groups');
select public.rls_enable_default_deny('public.social_accounts');
select public.rls_enable_default_deny('public.social_posts');
select public.rls_enable_default_deny('public.social_hashtag_groups');
select public.audit_enable_for('public.social_accounts');
select public.audit_enable_for('public.social_posts');
select public.audit_enable_for('public.social_hashtag_groups');

create unique index if not exists uq_social_accounts on public.social_accounts (company_id, provider, external_id) where deleted_at is null;
create index if not exists ix_social_posts_company on public.social_posts (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_social_posts_due on public.social_posts (scheduled_at) where status = 'scheduled' and deleted_at is null;
create index if not exists ix_social_posts_publishing on public.social_posts (publish_after) where status = 'publishing' and deleted_at is null;
create index if not exists ix_social_posts_account_published on public.social_posts (account_id, published_at desc) where status = 'published';
create unique index if not exists uq_social_hashtag_groups on public.social_hashtag_groups (company_id, lower(name)) where deleted_at is null;

-- A post belongs to an account of its company. A post moves one way:
--   draft -> scheduled, publishing, cancelled;  scheduled -> draft, publishing, cancelled;  publishing -> published, failed, scheduled;
--   failed -> draft, scheduled, publishing, cancelled;  published and cancelled are final.
-- Once a post is being published its text, link, image and account are fixed (what was published can always be explained).
create or replace function public.kd_social_post_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_provider text; ok boolean;
begin
  if tg_op = 'INSERT' then
    select company_id, provider into v_company, v_provider from public.social_accounts where id = new.account_id and deleted_at is null;
    if v_company is null or v_company <> new.company_id then raise exception 'the account was not found' using errcode = 'P0002'; end if;
    if new.status not in ('draft', 'scheduled') then raise exception 'a post starts as a draft or scheduled' using errcode = '55000'; end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.account_id is distinct from old.account_id then
    raise exception 'a post keeps its account' using errcode = '55000';
  end if;
  if old.status in ('published', 'cancelled') then
    raise exception 'a finished post does not change' using errcode = '55000';
  end if;
  if old.status in ('publishing', 'failed') and (new.body is distinct from old.body or new.link_url is distinct from old.link_url or new.image_url is distinct from old.image_url) and new.status not in ('draft') then
    raise exception 'a post that was sent to the network keeps its content' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'draft' then new.status in ('scheduled', 'publishing', 'cancelled')
      when 'scheduled' then new.status in ('draft', 'publishing', 'cancelled')
      when 'publishing' then new.status in ('published', 'failed', 'scheduled')
      when 'failed' then new.status in ('draft', 'scheduled', 'publishing', 'cancelled')
      else false end;
    if not ok then raise exception 'a post cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_social_posts_guard on public.social_posts;
create trigger trg_social_posts_guard before insert or update on public.social_posts for each row execute function public.kd_social_post_guard();

-- The identity of an account does not change.
create or replace function public.kd_social_account_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider is distinct from old.provider or new.external_id is distinct from old.external_id or new.company_id is distinct from old.company_id then
    raise exception 'the provider and id of an account do not change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_social_accounts_guard on public.social_accounts;
create trigger trg_social_accounts_guard before update on public.social_accounts for each row execute function public.kd_social_account_guard();
