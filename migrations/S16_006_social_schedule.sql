-- path: migrations/S16_006_social_schedule.sql
-- STEP 16.4.b Social media: schedules, rules, evergreen queue, approval, link tracking and statistics.
--   social_settings           per company: whether posts need approval, the hours after which an unreviewed post is approved, link tracking.
--   social_post_approvals     the history of approval decisions of a post (append only).
--   social_schedules          recurring posting patterns: days of the week and a time in a time zone.
--   social_rules              "when this custom event is fired, make a post for these accounts from this text".
--   social_rule_runs          one row per rule and source (the log of rules; a source is handled once).
--   social_evergreen_items    old posts to recycle, with text variants; social_evergreen_plans how often each account recycles.
--   social_links, social_link_hours  short tracked links and their clicks by hour.
--   social_post_stats         the numbers a network reported for a post.
-- And columns on accounts and posts for the daily frequency limit, approval, schedules, rules and evergreen items.

alter table public.social_accounts add column if not exists max_posts_per_day integer check (max_posts_per_day is null or max_posts_per_day between 1 and 100);

alter table public.social_posts
  add column if not exists track_links boolean not null default true,
  add column if not exists approval_status text not null default 'none' check (approval_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid,
  add column if not exists approval_reason text check (approval_reason is null or char_length(approval_reason) <= 300),
  add column if not exists approval_request_id uuid,
  add column if not exists schedule_id uuid,
  add column if not exists schedule_slot timestamptz,
  add column if not exists rule_id uuid,
  add column if not exists evergreen_item_id uuid;

create table if not exists public.social_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  approval_required boolean not null default false,
  approval_sla_hours integer check (approval_sla_hours is null or approval_sla_hours between 1 and 168),
  track_links boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_post_approvals (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  post_id uuid not null references public.social_posts (id) on delete restrict,
  event text not null check (event in ('submitted', 'approved', 'rejected', 'auto_approved', 'withdrawn')),
  actor_id uuid,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_schedules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.social_accounts (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  body text not null default '' check (char_length(body) <= 5000),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 2000)),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  hashtag_group_id uuid references public.social_hashtag_groups (id) on delete restrict,
  days_of_week smallint[] not null check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  time_of_day text not null check (time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null check (char_length(timezone) between 1 and 60),
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (body <> '' or image_url is not null)
);

create table if not exists public.social_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  trigger_key text not null check (trigger_key ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  account_ids uuid[] not null check (cardinality(account_ids) between 1 and 10),
  body_template text not null check (char_length(body_template) between 1 and 5000),
  hashtag_group_id uuid references public.social_hashtag_groups (id) on delete restrict,
  mode text not null default 'draft' check (mode in ('draft', 'publish')),
  enabled boolean not null default false,
  dry_run boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_rule_runs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  rule_id uuid not null references public.social_rules (id) on delete restrict,
  source_key text not null check (char_length(source_key) between 1 and 200),
  status text not null check (status in ('created', 'dry_run', 'skipped', 'failed')),
  reason text check (reason is null or char_length(reason) <= 300),
  rendered_text text not null default '' check (char_length(rendered_text) <= 5000),
  post_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_evergreen_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.social_accounts (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  variants text[] not null check (cardinality(variants) between 1 and 6),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 2000)),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  priority integer not null default 3 check (priority between 1 and 5),
  enabled boolean not null default true,
  times_posted integer not null default 0 check (times_posted >= 0),
  last_posted_at timestamptz,
  next_variant integer not null default 0 check (next_variant >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_evergreen_plans (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.social_accounts (id) on delete restrict,
  every_days integer not null check (every_days between 1 and 90),
  time_of_day text not null check (time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null check (char_length(timezone) between 1 and 60),
  min_items integer not null default 5 check (min_items between 0 and 100),
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_low_notice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_links (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  post_id uuid not null references public.social_posts (id) on delete restrict,
  code text not null check (code ~ '^[0-9A-Za-z]{10}$'),
  target_url text not null check (target_url ~ '^https://' and char_length(target_url) <= 2000),
  clicks integer not null default 0 check (clicks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_link_hours (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  link_id uuid not null references public.social_links (id) on delete restrict,
  hour_start timestamptz not null,
  clicks integer not null default 0 check (clicks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.social_post_stats (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  post_id uuid not null references public.social_posts (id) on delete restrict,
  metrics jsonb not null default '{}' check (jsonb_typeof(metrics) = 'object'),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.social_settings');
select public.apply_standard_triggers('public.social_schedules');
select public.apply_standard_triggers('public.social_rules');
select public.apply_standard_triggers('public.social_evergreen_items');
select public.apply_standard_triggers('public.social_evergreen_plans');
select public.rls_enable_default_deny('public.social_settings');
select public.rls_enable_default_deny('public.social_post_approvals');
select public.rls_enable_default_deny('public.social_schedules');
select public.rls_enable_default_deny('public.social_rules');
select public.rls_enable_default_deny('public.social_rule_runs');
select public.rls_enable_default_deny('public.social_evergreen_items');
select public.rls_enable_default_deny('public.social_evergreen_plans');
select public.rls_enable_default_deny('public.social_links');
select public.rls_enable_default_deny('public.social_link_hours');
select public.rls_enable_default_deny('public.social_post_stats');
select public.audit_enable_for('public.social_settings');
select public.audit_enable_for('public.social_schedules');
select public.audit_enable_for('public.social_rules');
select public.audit_enable_for('public.social_evergreen_items');
select public.audit_enable_for('public.social_evergreen_plans');

create unique index if not exists uq_social_settings on public.social_settings (company_id) where deleted_at is null;
create unique index if not exists uq_social_posts_slot on public.social_posts (schedule_id, schedule_slot) where schedule_id is not null;
create index if not exists ix_social_posts_approval on public.social_posts (company_id, approval_requested_at) where approval_status = 'pending' and deleted_at is null;
create index if not exists ix_social_post_approvals on public.social_post_approvals (post_id, created_at);
create index if not exists ix_social_schedules on public.social_schedules (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_social_rules_key on public.social_rules (company_id, trigger_key) where deleted_at is null and enabled;
create unique index if not exists uq_social_rule_runs on public.social_rule_runs (rule_id, source_key);
create index if not exists ix_social_evergreen_items on public.social_evergreen_items (account_id, priority desc, last_posted_at nulls first) where deleted_at is null and enabled;
create unique index if not exists uq_social_evergreen_plans on public.social_evergreen_plans (account_id) where deleted_at is null;
create unique index if not exists uq_social_links_code on public.social_links (code);
create index if not exists ix_social_links_post on public.social_links (post_id);
create unique index if not exists uq_social_link_hours on public.social_link_hours (link_id, hour_start);
create unique index if not exists uq_social_post_stats on public.social_post_stats (post_id);

-- The rows of these tables belong to the company of the row they point to.
create or replace function public.kd_social_child_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; acc uuid;
begin
  if tg_table_name = 'social_post_approvals' then
    select company_id into v_company from public.social_posts where id = new.post_id;
  elsif tg_table_name = 'social_links' or tg_table_name = 'social_post_stats' then
    select company_id into v_company from public.social_posts where id = new.post_id;
  elsif tg_table_name = 'social_link_hours' then
    select company_id into v_company from public.social_links where id = new.link_id;
  elsif tg_table_name = 'social_rule_runs' then
    select company_id into v_company from public.social_rules where id = new.rule_id;
  elsif tg_table_name = 'social_rules' then
    v_company := new.company_id;
    foreach acc in array new.account_ids loop
      if (select company_id from public.social_accounts where id = acc and deleted_at is null) is distinct from new.company_id then
        raise exception 'the account was not found' using errcode = 'P0002';
      end if;
    end loop;
  else
    select company_id into v_company from public.social_accounts where id = new.account_id and deleted_at is null;
  end if;
  if v_company is null or v_company <> new.company_id then raise exception 'the related record was not found' using errcode = 'P0002'; end if;
  return new;
end
$$;
do $$
declare t text;
begin
  foreach t in array array['social_post_approvals', 'social_links', 'social_post_stats', 'social_link_hours', 'social_rule_runs', 'social_rules', 'social_schedules', 'social_evergreen_items', 'social_evergreen_plans'] loop
    execute format('drop trigger if exists trg_%s_guard on public.%s', t, t);
    execute format('create trigger trg_%s_guard before insert on public.%s for each row execute function public.kd_social_child_guard()', t, t);
  end loop;
end
$$;

-- Approval history is append only.
create or replace function public.kd_social_append_only() returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'this record does not change' using errcode = '55000';
end
$$;
drop trigger if exists trg_social_post_approvals_append on public.social_post_approvals;
create trigger trg_social_post_approvals_append before update on public.social_post_approvals for each row execute function public.kd_social_append_only();

-- The post guard of 16.4.a, with the approval rules added: a post waiting for or refused approval is not published, and a post
-- whose content changed after approval is not approved any more.
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
  if (new.body is distinct from old.body or new.link_url is distinct from old.link_url or new.image_url is distinct from old.image_url)
     and old.approval_status = 'approved' and new.approval_status = 'approved' then
    raise exception 'a post that was approved and then changed needs a new approval' using errcode = '55000';
  end if;
  if new.status = 'publishing' and old.status <> 'publishing' and new.approval_status in ('pending', 'rejected') then
    raise exception 'this post is waiting for approval or was refused' using errcode = '55000';
  end if;
  if new.approval_status is distinct from old.approval_status then
    ok := case old.approval_status
      when 'none' then new.approval_status in ('pending', 'approved')
      when 'pending' then new.approval_status in ('approved', 'rejected', 'none')
      when 'rejected' then new.approval_status in ('pending', 'none')
      when 'approved' then new.approval_status in ('none', 'pending')
      else false end;
    if not ok then raise exception 'approval cannot go from % to %', old.approval_status, new.approval_status using errcode = '55000'; end if;
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

-- A click: counts it on the link and in the hour, and returns where the link goes (null for an unknown code).
create or replace function public.kd_social_click(p_code text) returns text
language plpgsql
set search_path = public
as $$
declare v_link public.social_links%rowtype;
begin
  update public.social_links set clicks = clicks + 1 where code = p_code and deleted_at is null returning * into v_link;
  if v_link.id is null then return null; end if;
  insert into public.social_link_hours (company_id, link_id, hour_start, clicks)
    values (v_link.company_id, v_link.id, date_trunc('hour', now()), 1)
    on conflict (link_id, hour_start) do update set clicks = public.social_link_hours.clicks + 1, updated_at = now();
  return v_link.target_url;
end
$$;
