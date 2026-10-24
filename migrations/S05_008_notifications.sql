-- path: migrations/S05_008_notifications.sql
-- STEP 05.9 In-app notifications: one row per recipient, preferences, mutes, digest setting. Realtime for the owner's rows.

create table if not exists public.notifications (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  category text not null check (category in ('invoice', 'payment', 'system', 'team', 'security', 'kyc', 'subscription')),
  type text not null check (type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  href text check (href is null or (href ~ '^/[^/\\]' and char_length(href) <= 300)),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.notification_preferences (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  category text not null check (category in ('invoice', 'payment', 'system', 'team', 'security', 'kyc', 'subscription')),
  channel text not null check (channel in ('in_app', 'email')),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.notification_mutes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  category text not null check (category in ('invoice', 'payment', 'system', 'team', 'security', 'kyc', 'subscription')),
  until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.notification_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  daily_digest boolean not null default false,
  last_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.notifications');
select public.apply_standard_triggers('public.notification_preferences');
select public.apply_standard_triggers('public.notification_mutes');
select public.apply_standard_triggers('public.notification_settings');
select public.rls_enable_default_deny('public.notifications');
select public.rls_enable_default_deny('public.notification_preferences');
select public.rls_enable_default_deny('public.notification_mutes');
select public.rls_enable_default_deny('public.notification_settings');

create index if not exists ix_notifications_user on public.notifications (user_id, created_at desc) where deleted_at is null;
create index if not exists ix_notifications_unread on public.notifications (user_id) where deleted_at is null and read_at is null;
create index if not exists ix_notifications_dedupe on public.notifications (user_id, dedupe_key, created_at desc) where dedupe_key is not null;
create unique index if not exists uq_notification_pref on public.notification_preferences (user_id, category, channel) where deleted_at is null;
create unique index if not exists uq_notification_mute on public.notification_mutes (user_id, category) where deleted_at is null;
create unique index if not exists uq_notification_setting on public.notification_settings (user_id) where deleted_at is null;

revoke all on public.notifications, public.notification_preferences, public.notification_mutes, public.notification_settings from authenticated;
grant all on public.notifications, public.notification_preferences, public.notification_mutes, public.notification_settings to service_role;

-- The browser may read its own rows (this lets Realtime push them). Writing goes through the server only.
grant select (id, user_id, company_id, category, type, title, body, href, read_at, created_at) on public.notifications to authenticated;
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

-- Realtime publication, when the database has one (Supabase). A plain PostgreSQL database skips this.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end
$$;

-- Stores one notification for one person. Returns the id, or null when the same dedupe key was stored in the last
-- 24 hours (a repeated event) or the person already got p_max_per_hour notifications this hour (throttle).
create or replace function public.kd_notify_insert(
  p_company uuid, p_user uuid, p_category text, p_type text, p_title text, p_body text, p_href text, p_dedupe text, p_max_per_hour integer
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_dedupe is not null and exists (
    select 1 from public.notifications where user_id = p_user and dedupe_key = p_dedupe and created_at > now() - interval '24 hours') then
    return null;
  end if;
  if (select count(*) from public.notifications where user_id = p_user and created_at > now() - interval '1 hour') >= p_max_per_hour then
    return null;
  end if;
  insert into public.notifications (company_id, user_id, category, type, title, body, href, dedupe_key)
  values (p_company, p_user, p_category, p_type, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_href, p_dedupe)
  returning id into new_id;
  return new_id;
end
$$;

-- Marks notifications as read. p_ids null means all unread ones. Only the person's own rows are touched.
create or replace function public.kd_notification_mark_read(p_user uuid, p_ids uuid[]) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.notifications set read_at = now()
  where user_id = p_user and read_at is null and deleted_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end
$$;

-- Notifications older than 180 days are removed (read ones) or kept (unread ones up to 1 year).
create or replace function public.kd_notification_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.notifications set deleted_at = now()
  where deleted_at is null and ((read_at is not null and created_at < now() - interval '180 days') or created_at < now() - interval '365 days');
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_notify_insert(uuid, uuid, text, text, text, text, text, text, integer),
  public.kd_notification_mark_read(uuid, uuid[]), public.kd_notification_purge() from public, anon, authenticated;
grant execute on function public.kd_notify_insert(uuid, uuid, text, text, text, text, text, text, integer),
  public.kd_notification_mark_read(uuid, uuid[]), public.kd_notification_purge() to service_role;
