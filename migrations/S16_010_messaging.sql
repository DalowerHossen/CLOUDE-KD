-- path: migrations/S16_010_messaging.sql
-- STEP 16.9 Multi-channel messaging (e-mail and WhatsApp).
--   messaging_settings      per company: quiet hours with a time zone, the cost of one message per channel, the smallest sample of an A/B test.
--   messaging_routes        per message kind: the channels to try, in order.
--   messaging_client_prefs  per client: the channel to try first and the channels the client does not want.
--   messaging_campaigns     multi-channel campaigns, with an optional A/B test and its winner.
--   messaging_variants      up to four variants of a campaign (A to D): channel order, text, WhatsApp template.
--   messaging_messages      one row per message to one client: the attempts per channel, the channel that sent it, cost, delivery and engagement.

create or replace function public.kd_unique_array(a text[]) returns boolean
language sql immutable
set search_path = public
as $$ select cardinality(a) = (select count(distinct x) from unnest(a) as x) $$;

create table if not exists public.messaging_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  quiet_enabled boolean not null default false,
  quiet_start text not null default '22:00' check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text not null default '08:00' check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 60),
  email_cost numeric(18,4) not null default 0 check (email_cost >= 0),
  whatsapp_cost numeric(18,4) not null default 0 check (whatsapp_cost >= 0),
  ab_min_sample integer not null default 20 check (ab_min_sample between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (quiet_start <> quiet_end)
);

create table if not exists public.messaging_routes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  channels text[] not null check (cardinality(channels) between 1 and 2 and channels <@ array['email', 'whatsapp']::text[] and public.kd_unique_array(channels)),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.messaging_client_prefs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  preferred text check (preferred is null or preferred in ('email', 'whatsapp')),
  blocked text[] not null default '{}' check (blocked <@ array['email', 'whatsapp']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (preferred is null or not (preferred = any (blocked)))
);

create table if not exists public.messaging_campaigns (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  status text not null default 'draft' check (status in ('draft', 'testing', 'running', 'paused', 'finished', 'cancelled')),
  segment jsonb not null default '{}' check (jsonb_typeof(segment) = 'object'),
  ab_enabled boolean not null default false,
  test_percent integer not null default 20 check (test_percent between 5 and 50),
  decide_after_hours integer not null default 24 check (decide_after_hours between 1 and 168),
  winner_variant_id uuid,
  winner_chosen_at timestamptz,
  winner_reason text check (winner_reason is null or char_length(winner_reason) <= 300),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.messaging_variants (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  campaign_id uuid not null references public.messaging_campaigns (id) on delete restrict,
  label text not null check (label ~ '^[A-D]$'),
  channel_order text[] not null check (cardinality(channel_order) between 1 and 2 and channel_order <@ array['email', 'whatsapp']::text[] and public.kd_unique_array(channel_order)),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 4000),
  whatsapp_template_id uuid references public.whatsapp_templates (id) on delete restrict,
  whatsapp_values jsonb not null default '{}' check (jsonb_typeof(whatsapp_values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ('whatsapp' <> all (channel_order) or whatsapp_template_id is not null),
  check ('email' <> all (channel_order) or (subject <> '' and body <> ''))
);

create table if not exists public.messaging_messages (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  kind text not null check (kind in ('notice', 'campaign')),
  route_kind text not null default 'custom' check (route_kind ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  campaign_id uuid references public.messaging_campaigns (id) on delete restrict,
  variant_id uuid references public.messaging_variants (id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'held', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  send_after timestamptz not null default now(),
  channel_order text[] not null check (cardinality(channel_order) between 1 and 2),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 4000),
  whatsapp_template_id uuid references public.whatsapp_templates (id) on delete restrict,
  whatsapp_values jsonb not null default '{}' check (jsonb_typeof(whatsapp_values) = 'object'),
  attempts jsonb not null default '[]' check (jsonb_typeof(attempts) = 'array'),
  channel text check (channel is null or channel in ('email', 'whatsapp')),
  cost numeric(18,4) not null default 0 check (cost >= 0),
  email_key text check (email_key is null or char_length(email_key) between 8 and 200),
  whatsapp_message_id uuid,
  delivered boolean not null default false,
  engaged_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'sent') = (channel is not null)),
  check (kind <> 'campaign' or (campaign_id is not null and variant_id is not null))
);

select public.apply_standard_triggers('public.messaging_settings');
select public.apply_standard_triggers('public.messaging_routes');
select public.apply_standard_triggers('public.messaging_client_prefs');
select public.apply_standard_triggers('public.messaging_campaigns');
select public.apply_standard_triggers('public.messaging_variants');
select public.apply_standard_triggers('public.messaging_messages');
select public.rls_enable_default_deny('public.messaging_settings');
select public.rls_enable_default_deny('public.messaging_routes');
select public.rls_enable_default_deny('public.messaging_client_prefs');
select public.rls_enable_default_deny('public.messaging_campaigns');
select public.rls_enable_default_deny('public.messaging_variants');
select public.rls_enable_default_deny('public.messaging_messages');
select public.audit_enable_for('public.messaging_settings');
select public.audit_enable_for('public.messaging_routes');
select public.audit_enable_for('public.messaging_client_prefs');
select public.audit_enable_for('public.messaging_campaigns');
select public.audit_enable_for('public.messaging_variants');

create unique index if not exists uq_messaging_settings on public.messaging_settings (company_id) where deleted_at is null;
create unique index if not exists uq_messaging_routes on public.messaging_routes (company_id, kind) where deleted_at is null;
create unique index if not exists uq_messaging_prefs on public.messaging_client_prefs (company_id, client_id) where deleted_at is null;
create unique index if not exists uq_messaging_variants on public.messaging_variants (campaign_id, label) where deleted_at is null;
create unique index if not exists uq_messaging_messages_key on public.messaging_messages (company_id, idempotency_key);
create unique index if not exists uq_messaging_campaign_client on public.messaging_messages (campaign_id, client_id) where campaign_id is not null;
create index if not exists ix_messaging_due on public.messaging_messages (send_after) where status in ('queued', 'sending') and deleted_at is null;
create index if not exists ix_messaging_campaign on public.messaging_messages (campaign_id, status) where campaign_id is not null;
create index if not exists ix_messaging_engage on public.messaging_messages (sent_at) where status = 'sent' and engaged_at is null and deleted_at is null;

-- Rows belong to the company of what they point to. A campaign's variants and messages cannot be changed once it started
-- (the variants), and a message that was sent or skipped is final.
create or replace function public.kd_messaging_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_status text; ok boolean;
begin
  if tg_table_name = 'messaging_client_prefs' or tg_table_name = 'messaging_messages' then
    select company_id into v_company from public.clients where id = new.client_id and deleted_at is null;
    if tg_op = 'INSERT' and (v_company is null or v_company <> new.company_id) then raise exception 'the client was not found' using errcode = 'P0002'; end if;
  end if;
  if tg_table_name = 'messaging_variants' then
    select company_id, status into v_company, v_status from public.messaging_campaigns where id = new.campaign_id;
    if v_company is null or v_company <> new.company_id then raise exception 'the campaign was not found' using errcode = 'P0002'; end if;
    if v_status <> 'draft' then raise exception 'the variants of a started campaign do not change' using errcode = '55000'; end if;
    if new.whatsapp_template_id is not null and (select company_id from public.whatsapp_templates where id = new.whatsapp_template_id) is distinct from new.company_id then
      raise exception 'the template was not found' using errcode = 'P0002';
    end if;
  end if;
  if tg_table_name = 'messaging_messages' then
    if tg_op = 'INSERT' then
      if new.campaign_id is not null and (select company_id from public.messaging_campaigns where id = new.campaign_id) is distinct from new.company_id then
        raise exception 'the campaign was not found' using errcode = 'P0002';
      end if;
      if new.variant_id is not null and (select campaign_id from public.messaging_variants where id = new.variant_id) is distinct from new.campaign_id then
        raise exception 'the variant belongs to another campaign' using errcode = '55000';
      end if;
      if new.status not in ('queued', 'held') then raise exception 'a message starts queued or held' using errcode = '55000'; end if;
    else
      if new.company_id is distinct from old.company_id or new.client_id is distinct from old.client_id or new.campaign_id is distinct from old.campaign_id then
        raise exception 'a message keeps its client and campaign' using errcode = '55000';
      end if;
      if old.status in ('sent', 'skipped', 'cancelled') and (new.status is distinct from old.status or new.channel is distinct from old.channel) then
        raise exception 'a finished message does not change' using errcode = '55000';
      end if;
      if new.status is distinct from old.status then
        ok := case old.status
          when 'held' then new.status in ('queued', 'cancelled')
          when 'queued' then new.status in ('sending', 'cancelled')
          when 'sending' then new.status in ('sent', 'skipped', 'failed', 'queued')
          when 'failed' then new.status = 'queued'
          else false end;
        if not ok then raise exception 'a message cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
      end if;
    end if;
  end if;
  return new;
end
$$;
do $$
declare t text;
begin
  foreach t in array array['messaging_client_prefs', 'messaging_variants', 'messaging_messages'] loop
    execute format('drop trigger if exists trg_%s_guard on public.%s', t, t);
    execute format('create trigger trg_%s_guard before insert or update on public.%s for each row execute function public.kd_messaging_guard()', t, t);
  end loop;
end
$$;

-- A campaign moves forward only; its winner is chosen once and is one of its own variants.
create or replace function public.kd_messaging_campaign_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'a campaign starts as a draft' using errcode = '55000'; end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id then raise exception 'a campaign keeps its company' using errcode = '55000'; end if;
  if old.status <> 'draft' and (new.segment is distinct from old.segment or new.ab_enabled is distinct from old.ab_enabled
     or new.test_percent is distinct from old.test_percent or new.decide_after_hours is distinct from old.decide_after_hours) then
    raise exception 'a started campaign does not change its audience or test' using errcode = '55000';
  end if;
  if old.winner_variant_id is not null and new.winner_variant_id is distinct from old.winner_variant_id then
    raise exception 'the winner is chosen once' using errcode = '55000';
  end if;
  if new.winner_variant_id is not null and new.winner_variant_id is distinct from old.winner_variant_id then
    if (select campaign_id from public.messaging_variants where id = new.winner_variant_id) is distinct from new.id then
      raise exception 'the winner must be a variant of this campaign' using errcode = '55000';
    end if;
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'draft' then new.status in ('testing', 'running', 'cancelled')
      when 'testing' then new.status in ('running', 'paused', 'cancelled')
      when 'running' then new.status in ('paused', 'finished', 'cancelled')
      when 'paused' then new.status in ('testing', 'running', 'cancelled')
      else false end;
    if not ok then raise exception 'a campaign cannot go from % to %', old.status, new.status using errcode = '55000'; end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_messaging_campaigns_guard on public.messaging_campaigns;
create trigger trg_messaging_campaigns_guard before insert or update on public.messaging_campaigns for each row execute function public.kd_messaging_campaign_guard();

-- Takes due messages for one worker.
create or replace function public.kd_claim_messages(p_limit integer) returns setof public.messaging_messages
language plpgsql
set search_path = public
as $$
begin
  return query
  with due as (
    select m.id from public.messaging_messages m
    where m.status = 'queued' and m.send_after <= now() and m.deleted_at is null
    order by m.send_after
    limit greatest(p_limit, 1)
    for update of m skip locked
  )
  update public.messaging_messages m set status = 'sending', updated_at = now()
  from due where m.id = due.id
  returning m.*;
end
$$;
