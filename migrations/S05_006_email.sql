-- path: migrations/S05_006_email.sql
-- STEP 05.7 E-mail: sending settings (platform and tenant), outbox with retry, suppression list, delivery events.

create table if not exists public.email_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  priority integer not null default 1 check (priority between 1 and 3),
  -- "platform" (tenant rows only): send through the platform provider but with this name and reply-to.
  provider text not null check (provider in ('platform', 'smtp', 'resend', 'sendgrid', 'ses', 'mailgun', 'postmark')),
  preset text check (preset is null or preset ~ '^[a-z0-9_]{2,30}$'),
  config jsonb not null default '{}'::jsonb,
  credential jsonb,
  from_email text check (from_email is null or (from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(from_email) <= 254)),
  from_name text not null default '' check (char_length(from_name) <= 120),
  reply_to text check (reply_to is null or (reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(reply_to) <= 254)),
  daily_limit integer check (daily_limit is null or daily_limit between 1 and 10000000),
  monthly_limit integer check (monthly_limit is null or monthly_limit between 1 and 100000000),
  enabled boolean not null default true,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (provider = 'platform' or from_email is not null),
  check (provider <> 'platform' or company_id is not null)
);

create table if not exists public.email_outbox (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  dedupe_hash text not null check (dedupe_hash ~ '^[0-9a-f]{64}$'),
  template text not null check (template ~ '^[a-z0-9][a-z0-9_.-]{1,80}$'),
  to_email text not null check (char_length(to_email) <= 254),
  subject text not null check (char_length(subject) <= 300),
  body_html text not null default '',
  body_text text not null default '',
  links jsonb not null default '[]'::jsonb,
  track boolean not null default false,
  tracking_token text check (tracking_token is null or char_length(tracking_token) <= 80),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  send_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  provider text check (provider is null or provider in ('smtp', 'resend', 'sendgrid', 'ses', 'mailgun', 'postmark')),
  setting_id uuid,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 300),
  error text check (error is null or char_length(error) <= 300),
  delivery_status text not null default 'none' check (delivery_status in ('none', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.email_suppressions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  reason text not null check (reason in ('hard_bounce', 'complaint', 'manual', 'unsubscribe')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.email_events (
  -- guard:append-only (delivery history; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  outbox_id uuid not null,
  kind text not null check (kind in ('delivered', 'opened', 'clicked', 'bounce_hard', 'bounce_soft', 'complaint')),
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.email_settings');
select public.apply_standard_triggers('public.email_suppressions');
select public.rls_enable_default_deny('public.email_settings');
select public.rls_enable_default_deny('public.email_outbox');
select public.rls_enable_default_deny('public.email_suppressions');
select public.rls_enable_default_deny('public.email_events');
select public.audit_enable_for('public.email_settings');
select public.audit_enable_for('public.email_suppressions');

create unique index if not exists uq_email_settings_slot on public.email_settings (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), priority) where deleted_at is null;
create unique index if not exists uq_email_outbox_key on public.email_outbox (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key);
create index if not exists ix_email_outbox_due on public.email_outbox (next_attempt_at) where status in ('queued', 'sending');
create index if not exists ix_email_outbox_dedupe on public.email_outbox (dedupe_hash, created_at desc);
create index if not exists ix_email_outbox_message on public.email_outbox (provider_message_id) where provider_message_id is not null;
create index if not exists ix_email_outbox_company on public.email_outbox (company_id, created_at desc);
create unique index if not exists uq_email_suppression on public.email_suppressions (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), email) where deleted_at is null;
create index if not exists ix_email_events_outbox on public.email_events (outbox_id, created_at);

drop trigger if exists trg_email_events_immutable on public.email_events;
create trigger trg_email_events_immutable before update or delete on public.email_events
  for each row execute function public.audit_block_change();
drop trigger if exists trg_email_events_no_truncate on public.email_events;
create trigger trg_email_events_no_truncate before truncate on public.email_events
  for each statement execute function public.audit_block_change();

revoke all on public.email_settings, public.email_outbox, public.email_suppressions, public.email_events from authenticated;
grant all on public.email_settings, public.email_outbox, public.email_suppressions, public.email_events to service_role;

-- Adds a message to the outbox. Returns { id, state } where state is queued, suppressed, exists (same idempotency key)
-- or duplicate (same recipient, template and content inside one minute: the second one is not sent).
create or replace function public.kd_email_enqueue(
  p_company uuid, p_key text, p_dedupe text, p_template text, p_to text, p_subject text, p_html text, p_text text,
  p_links jsonb, p_track boolean, p_token text, p_send_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  existing public.email_outbox%rowtype;
  new_id uuid;
  muted boolean;
begin
  select * into existing from public.email_outbox
    where coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_company, '00000000-0000-0000-0000-000000000000'::uuid) and idempotency_key = p_key;
  if found then return jsonb_build_object('id', existing.id, 'state', 'exists'); end if;
  select * into existing from public.email_outbox where dedupe_hash = p_dedupe and created_at > now() - interval '1 minute' and status <> 'suppressed' limit 1;
  if found then return jsonb_build_object('id', existing.id, 'state', 'duplicate'); end if;
  muted := exists (
    select 1 from public.email_suppressions s
    where s.deleted_at is null and s.email = lower(p_to) and (s.company_id is null or s.company_id is not distinct from p_company));
  insert into public.email_outbox (company_id, idempotency_key, dedupe_hash, template, to_email, subject, body_html, body_text, links, track, tracking_token, status, send_at, next_attempt_at, error)
  values (p_company, p_key, p_dedupe, p_template, lower(p_to), p_subject, p_html, p_text, p_links, p_track, p_token,
    case when muted then 'suppressed' else 'queued' end, p_send_at, p_send_at, case when muted then 'The address is on the suppression list.' end)
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'state', case when muted then 'suppressed' else 'queued' end);
end
$$;

-- Hands out due messages (a message stuck in "sending" for 10 minutes is handed out again). p_id limits it to one message.
create or replace function public.kd_email_claim(p_limit integer, p_id uuid default null) returns setof public.email_outbox
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select o.id from public.email_outbox o
    where o.deleted_at is null and o.attempts < 6 and o.next_attempt_at <= now()
      and (p_id is null or o.id = p_id)
      and (o.status = 'queued' or (o.status = 'sending' and o.updated_at < now() - interval '10 minutes'))
    order by o.next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.email_outbox o set status = 'sending', attempts = o.attempts + 1
  from picked where o.id = picked.id
  returning o.*;
end
$$;

-- Result of one send attempt: sent, retry later (p_retry_at) or failed for good.
create or replace function public.kd_email_result(p_id uuid, p_status text, p_provider text, p_message_id text, p_error text, p_retry_at timestamptz, p_setting uuid default null) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'retry', 'defer') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.email_outbox set
    status = case p_status when 'sent' then 'sent' when 'failed' then 'failed' else 'queued' end,
    provider = coalesce(p_provider, provider),
    setting_id = coalesce(p_setting, setting_id),
    provider_message_id = coalesce(p_message_id, provider_message_id),
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    delivery_status = case when p_status = 'sent' then 'sent' else delivery_status end,
    error = left(p_error, 300),
    next_attempt_at = coalesce(p_retry_at, next_attempt_at),
    -- A deferral (daily limit) does not use up an attempt.
    attempts = case when p_status = 'defer' then greatest(attempts - 1, 0) else attempts end
  where id = p_id and deleted_at is null;
end
$$;

-- Delivery feedback from the provider. Hard bounces and complaints put the address on the suppression list.
create or replace function public.kd_email_event(p_provider_message_id text, p_kind text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  o public.email_outbox%rowtype;
  rank_new integer;
  rank_old integer;
  status_new text;
begin
  if p_kind not in ('delivered', 'opened', 'clicked', 'bounce_hard', 'bounce_soft', 'complaint') then raise exception 'bad kind' using errcode = '22023'; end if;
  select * into o from public.email_outbox where provider_message_id = p_provider_message_id and deleted_at is null order by created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  status_new := case p_kind when 'delivered' then 'delivered' when 'opened' then 'opened' when 'clicked' then 'clicked' when 'complaint' then 'complained' else 'bounced' end;
  rank_new := array_position(array['none', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'], status_new);
  rank_old := array_position(array['none', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'], o.delivery_status);
  -- Bounces and complaints always win; otherwise the status only moves forward.
  if rank_new > rank_old or status_new in ('bounced', 'complained') then
    update public.email_outbox set delivery_status = status_new,
      opened_at = case when p_kind in ('opened', 'clicked') then coalesce(opened_at, now()) else opened_at end,
      clicked_at = case when p_kind = 'clicked' then coalesce(clicked_at, now()) else clicked_at end
    where id = o.id;
  end if;
  insert into public.email_events (company_id, outbox_id, kind) values (o.company_id, o.id, p_kind);
  if p_kind in ('bounce_hard', 'complaint') then
    insert into public.email_suppressions (company_id, email, reason)
    values (o.company_id, o.to_email, case when p_kind = 'complaint' then 'complaint' else 'hard_bounce' end)
    on conflict do nothing;
  end if;
  return jsonb_build_object('found', true, 'outbox', o.id, 'company', o.company_id);
end
$$;

-- Engagement from our own pixel and links (token based), without a provider id.
create or replace function public.kd_email_track(p_token text, p_kind text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  o public.email_outbox%rowtype;
begin
  if p_kind not in ('opened', 'clicked') then raise exception 'bad kind' using errcode = '22023'; end if;
  select * into o from public.email_outbox where tracking_token = p_token and track and deleted_at is null;
  if not found then return false; end if;
  update public.email_outbox set
    opened_at = coalesce(opened_at, now()),
    clicked_at = case when p_kind = 'clicked' then coalesce(clicked_at, now()) else clicked_at end,
    delivery_status = case
      when p_kind = 'clicked' then 'clicked'
      when delivery_status in ('none', 'sent', 'delivered') then 'opened'
      else delivery_status end
  where id = o.id;
  insert into public.email_events (company_id, outbox_id, kind) values (o.company_id, o.id, p_kind);
  return true;
end
$$;

create or replace function public.kd_email_sent_count(p_company uuid, p_since timestamptz) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.email_outbox
  where status = 'sent' and sent_at >= p_since and company_id is not distinct from p_company
$$;

create or replace function public.kd_email_setting_count(p_setting uuid, p_since timestamptz) returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.email_outbox where status = 'sent' and sent_at >= p_since and setting_id = p_setting
$$;

-- One-click unsubscribe (RFC 8058): puts the recipient of the message on the company's suppression list.
create or replace function public.kd_email_unsubscribe(p_token text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  o public.email_outbox%rowtype;
begin
  select * into o from public.email_outbox where tracking_token = p_token and deleted_at is null;
  if not found then return false; end if;
  insert into public.email_suppressions (company_id, email, reason) values (o.company_id, o.to_email, 'unsubscribe') on conflict do nothing;
  return true;
end
$$;

-- Removes the content of old messages (30 days) and then the rows (90 days).
create or replace function public.kd_email_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.email_outbox set body_html = '', body_text = '', links = '[]'::jsonb
    where deleted_at is null and created_at < now() - interval '30 days' and (body_html <> '' or body_text <> '');
  update public.email_outbox set deleted_at = now() where deleted_at is null and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.kd_email_enqueue(uuid, text, text, text, text, text, text, text, jsonb, boolean, text, timestamptz),
  public.kd_email_claim(integer, uuid), public.kd_email_result(uuid, text, text, text, text, timestamptz, uuid),
  public.kd_email_event(text, text), public.kd_email_track(text, text), public.kd_email_sent_count(uuid, timestamptz),
  public.kd_email_setting_count(uuid, timestamptz), public.kd_email_purge(), public.kd_email_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.kd_email_enqueue(uuid, text, text, text, text, text, text, text, jsonb, boolean, text, timestamptz),
  public.kd_email_claim(integer, uuid), public.kd_email_result(uuid, text, text, text, text, timestamptz, uuid),
  public.kd_email_event(text, text), public.kd_email_track(text, text), public.kd_email_sent_count(uuid, timestamptz),
  public.kd_email_setting_count(uuid, timestamptz), public.kd_email_purge(), public.kd_email_unsubscribe(text) to service_role;
