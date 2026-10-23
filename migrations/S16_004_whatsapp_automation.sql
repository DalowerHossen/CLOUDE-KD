-- path: migrations/S16_004_whatsapp_automation.sql
-- STEP 16.3.b WhatsApp automation.
--   whatsapp_accounts.daily_limit  the most people the company may start a conversation with in a moving 24 hours (read from
--                                  Meta's messaging limit when it can be read; the owner may set it lower).
--   whatsapp_rules                 "when this happens, send this template": an event or a number of days before the due date,
--                                  dry run by default, with an optional delay.
--   whatsapp_rule_runs             one row per rule and source (the event id, or the invoice for a due-date rule): the outbox of
--                                  rules, so a repeated event sends nothing twice.
--   whatsapp_campaigns             a template sent to a segment of clients, one person once, within the daily limit.
--   whatsapp_campaign_items        the people of a campaign and what happened to each.

alter table public.whatsapp_accounts add column if not exists daily_limit integer not null default 250 check (daily_limit between 1 and 1000000);

create table if not exists public.whatsapp_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  trigger_kind text not null check (trigger_kind in ('event', 'due_soon')),
  event_name text check (event_name is null or char_length(event_name) between 3 and 60),
  days_before integer check (days_before is null or days_before between 0 and 60),
  template_id uuid not null references public.whatsapp_templates (id) on delete restrict,
  values jsonb not null default '{}' check (jsonb_typeof(values) = 'object'),
  enabled boolean not null default false,
  dry_run boolean not null default true,
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 10080),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((trigger_kind = 'event') = (event_name is not null)),
  check ((trigger_kind = 'due_soon') = (days_before is not null))
);

create table if not exists public.whatsapp_rule_runs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  rule_id uuid not null references public.whatsapp_rules (id) on delete restrict,
  source_key text not null check (char_length(source_key) between 1 and 200),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'dry_run', 'skipped', 'failed')),
  reason text check (reason is null or char_length(reason) <= 300),
  rendered_text text not null default '' check (char_length(rendered_text) <= 4096),
  message_id uuid references public.whatsapp_messages (id) on delete restrict,
  due_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.whatsapp_campaigns (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  template_id uuid not null references public.whatsapp_templates (id) on delete restrict,
  values jsonb not null default '{}' check (jsonb_typeof(values) = 'object'),
  segment jsonb not null default '{}' check (jsonb_typeof(segment) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'paused', 'done', 'cancelled')),
  dry_run boolean not null default true,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (status <> 'scheduled' or scheduled_at is not null),
  check ((status in ('done', 'cancelled')) = (finished_at is not null))
);

create table if not exists public.whatsapp_campaign_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  campaign_id uuid not null references public.whatsapp_campaigns (id) on delete restrict,
  client_id uuid,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  name text not null default '' check (char_length(name) <= 200),
  status text not null default 'pending' check (status in ('pending', 'sent', 'dry_run', 'skipped', 'failed')),
  reason text check (reason is null or char_length(reason) <= 300),
  rendered_text text not null default '' check (char_length(rendered_text) <= 4096),
  message_id uuid references public.whatsapp_messages (id) on delete restrict,
  error_code integer,
  attempts integer not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.whatsapp_rules');
select public.apply_standard_triggers('public.whatsapp_rule_runs');
select public.apply_standard_triggers('public.whatsapp_campaigns');
select public.apply_standard_triggers('public.whatsapp_campaign_items');
select public.rls_enable_default_deny('public.whatsapp_rules');
select public.rls_enable_default_deny('public.whatsapp_rule_runs');
select public.rls_enable_default_deny('public.whatsapp_campaigns');
select public.rls_enable_default_deny('public.whatsapp_campaign_items');
select public.audit_enable_for('public.whatsapp_rules');
select public.audit_enable_for('public.whatsapp_campaigns');

create index if not exists ix_whatsapp_rules_company on public.whatsapp_rules (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_whatsapp_rules_event on public.whatsapp_rules (company_id, event_name) where deleted_at is null and enabled;
create unique index if not exists uq_whatsapp_rule_runs_source on public.whatsapp_rule_runs (rule_id, source_key);
create index if not exists ix_whatsapp_rule_runs_due on public.whatsapp_rule_runs (due_at) where status = 'pending' and deleted_at is null;
create index if not exists ix_whatsapp_rule_runs_rule on public.whatsapp_rule_runs (rule_id, created_at desc) where deleted_at is null;
create index if not exists ix_whatsapp_campaigns_company on public.whatsapp_campaigns (company_id, created_at desc) where deleted_at is null;
create unique index if not exists uq_whatsapp_campaign_items on public.whatsapp_campaign_items (campaign_id, phone_e164);
create index if not exists ix_whatsapp_campaign_items_todo on public.whatsapp_campaign_items (campaign_id, status);

-- Rules and campaigns use a template of their own company; runs and items belong to the company of their rule or campaign.
create or replace function public.kd_whatsapp_automation_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  if tg_table_name in ('whatsapp_rules', 'whatsapp_campaigns') then
    select company_id into v_company from public.whatsapp_templates where id = new.template_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the template was not found' using errcode = 'P0002'; end if;
  elsif tg_table_name = 'whatsapp_rule_runs' then
    select company_id into v_company from public.whatsapp_rules where id = new.rule_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the rule was not found' using errcode = 'P0002'; end if;
  else
    select company_id into v_company from public.whatsapp_campaigns where id = new.campaign_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the campaign was not found' using errcode = 'P0002'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_rules_guard on public.whatsapp_rules;
create trigger trg_whatsapp_rules_guard before insert on public.whatsapp_rules for each row execute function public.kd_whatsapp_automation_guard();
drop trigger if exists trg_whatsapp_campaigns_guard on public.whatsapp_campaigns;
create trigger trg_whatsapp_campaigns_guard before insert on public.whatsapp_campaigns for each row execute function public.kd_whatsapp_automation_guard();
drop trigger if exists trg_whatsapp_rule_runs_guard on public.whatsapp_rule_runs;
create trigger trg_whatsapp_rule_runs_guard before insert on public.whatsapp_rule_runs for each row execute function public.kd_whatsapp_automation_guard();
drop trigger if exists trg_whatsapp_campaign_items_guard on public.whatsapp_campaign_items;
create trigger trg_whatsapp_campaign_items_guard before insert on public.whatsapp_campaign_items for each row execute function public.kd_whatsapp_automation_guard();

-- A campaign moves one way: draft, scheduled, running, paused, then done or cancelled (which are final). Its template, values and
-- segment are fixed once it has started, so what was sent can be explained afterwards.
create or replace function public.kd_whatsapp_campaign_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare ok boolean;
begin
  if new.company_id is distinct from old.company_id then raise exception 'a campaign keeps its company' using errcode = '55000'; end if;
  if old.status in ('done', 'cancelled') then
    raise exception 'a finished campaign does not change' using errcode = '55000';
  end if;
  if old.status <> 'draft' and (new.template_id is distinct from old.template_id or new.values is distinct from old.values
     or new.segment is distinct from old.segment or new.dry_run is distinct from old.dry_run) then
    raise exception 'a started campaign keeps its template, values and segment' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'draft' then new.status in ('scheduled', 'running', 'cancelled')
      when 'scheduled' then new.status in ('running', 'paused', 'cancelled')
      when 'running' then new.status in ('paused', 'done', 'cancelled')
      when 'paused' then new.status in ('running', 'cancelled')
      else false end;
    if not ok then raise exception 'a campaign cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_campaigns_status on public.whatsapp_campaigns;
create trigger trg_whatsapp_campaigns_status before update on public.whatsapp_campaigns for each row execute function public.kd_whatsapp_campaign_guard();

-- A person is in a campaign once; a sent item does not go back to waiting.
create or replace function public.kd_whatsapp_item_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_id is distinct from old.campaign_id or new.phone_e164 is distinct from old.phone_e164 or new.company_id is distinct from old.company_id then
    raise exception 'a campaign item keeps its campaign and number' using errcode = '55000';
  end if;
  if old.status = 'sent' and new.status <> 'sent' then
    raise exception 'a sent item does not change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_campaign_items_status on public.whatsapp_campaign_items;
create trigger trg_whatsapp_campaign_items_status before update on public.whatsapp_campaign_items for each row execute function public.kd_whatsapp_item_guard();

-- How many different people were started on a conversation with a template in the last 24 hours (the count the daily limit uses).
create or replace function public.kd_whatsapp_template_recipients_24h(p_company uuid) returns integer
language sql
stable
set search_path = public
as $$
  select count(distinct contact_id)::integer from public.whatsapp_messages
  where company_id = p_company and direction = 'out' and type = 'template' and status <> 'failed'
    and created_at > now() - interval '24 hours' and deleted_at is null;
$$;
