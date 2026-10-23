-- path: migrations/S04_004_tokens.sql
-- STEP 04.8 Access tokens for tokenized links (clients have no login). Only the SHA-256 hash of a token is stored.

create table if not exists public.access_tokens (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  doc_type text not null check (doc_type in ('invoice', 'estimate', 'receipt', 'hub', 'contract', 'payslip', 'payment')),
  doc_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  otp_required boolean not null default false,
  otp_hash text check (otp_hash is null or otp_hash ~ '^[0-9a-f]{64}$'),
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0 check (otp_attempts >= 0),
  otp_locked_until timestamptz,
  ttl_days integer not null check (ttl_days between 1 and 365),
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  reissued_from uuid references public.access_tokens (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.token_events (
  -- guard:append-only (token history; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  token_id uuid,
  event text not null check (event in ('issued', 'verified', 'invalid', 'expired', 'revoked', 'reissued', 'otp_sent', 'otp_failed', 'otp_verified', 'otp_locked', 'leak_suspected')),
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

select public.apply_standard_triggers('public.access_tokens');
select public.audit_enable_for('public.access_tokens');
select public.rls_enable_default_deny('public.access_tokens');
select public.rls_enable_default_deny('public.token_events');

create unique index if not exists uq_access_tokens_hash on public.access_tokens (token_hash);
create index if not exists ix_access_tokens_doc on public.access_tokens (company_id, doc_type, doc_id);
create index if not exists ix_access_tokens_expiry on public.access_tokens (expires_at) where revoked_at is null;
create index if not exists ix_token_events_token on public.token_events (token_id, created_at desc);
create index if not exists ix_token_events_ip on public.token_events (ip_hash, created_at desc);

drop trigger if exists trg_token_events_immutable on public.token_events;
create trigger trg_token_events_immutable before update or delete on public.token_events
  for each row execute function public.audit_block_change();
drop trigger if exists trg_token_events_no_truncate on public.token_events;
create trigger trg_token_events_no_truncate before truncate on public.token_events
  for each statement execute function public.audit_block_change();

-- A company owner may read the token rows of the own company, without the hashes (column grants).
revoke all on public.access_tokens, public.token_events from authenticated;
grant select (id, company_id, doc_type, doc_id, expires_at, revoked_at, otp_required, ttl_days, last_used_at, use_count, created_at) on public.access_tokens to authenticated;
grant all on public.access_tokens, public.token_events to service_role;
drop policy if exists access_tokens_owner on public.access_tokens;
create policy access_tokens_owner on public.access_tokens for select to authenticated
  using (deleted_at is null and company_id = (select public.app_company_id()) and (select public.app_role()) in ('owner', 'staff'));

create or replace function public.kd_token_event(p_company uuid, p_token uuid, p_event text, p_ip_hash text, p_details jsonb) returns void
language sql security definer
set search_path = public
as $$
  insert into public.token_events (company_id, token_id, event, ip_hash, details) values (p_company, p_token, p_event, p_ip_hash, coalesce(p_details, '{}'::jsonb))
$$;

-- Marks a successful use. Returns how many different addresses used the token in the last 24 hours (leak detection).
create or replace function public.kd_token_touch(p_token uuid, p_ip_hash text) returns integer
language plpgsql security definer
set search_path = public
as $$
declare ips integer; cid uuid;
begin
  update public.access_tokens set last_used_at = now(), use_count = use_count + 1 where id = p_token returning company_id into cid;
  insert into public.token_events (company_id, token_id, event, ip_hash) values (cid, p_token, 'verified', p_ip_hash);
  select count(distinct ip_hash)::integer into ips from public.token_events
  where token_id = p_token and event = 'verified' and ip_hash is not null and created_at > now() - interval '24 hours';
  return ips;
end
$$;

create or replace function public.kd_token_otp_set(p_token uuid, p_otp_hash text, p_ttl_seconds integer) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.access_tokens set otp_hash = p_otp_hash, otp_expires_at = now() + make_interval(secs => p_ttl_seconds), otp_attempts = 0
  where id = p_token and revoked_at is null and expires_at > now() and (otp_locked_until is null or otp_locked_until < now());
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Checks a one-time code. At most 5 wrong codes, then the code gate is locked for 15 minutes. The code works once.
create or replace function public.kd_token_otp_check(p_token uuid, p_otp_hash text) returns text
language plpgsql security definer
set search_path = public
as $$
declare t public.access_tokens;
begin
  select * into t from public.access_tokens where id = p_token for update;
  if not found or t.revoked_at is not null or t.expires_at <= now() then return 'invalid'; end if;
  if t.otp_locked_until is not null and t.otp_locked_until > now() then return 'locked'; end if;
  if t.otp_hash is null or t.otp_expires_at is null or t.otp_expires_at <= now() then return 'expired'; end if;
  if t.otp_hash = p_otp_hash then
    update public.access_tokens set otp_hash = null, otp_expires_at = null, otp_attempts = 0 where id = t.id;
    return 'ok';
  end if;
  update public.access_tokens set otp_attempts = otp_attempts + 1,
    otp_locked_until = case when otp_attempts + 1 >= 5 then now() + interval '15 minutes' end,
    otp_hash = case when otp_attempts + 1 >= 5 then null else otp_hash end
  where id = t.id;
  return case when t.otp_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end
$$;

create or replace function public.kd_token_revoke(p_token uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.access_tokens set revoked_at = now() where id = p_token and revoked_at is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.kd_token_event(uuid, uuid, text, text, jsonb)', 'public.kd_token_touch(uuid, text)',
    'public.kd_token_otp_set(uuid, text, integer)', 'public.kd_token_otp_check(uuid, text)', 'public.kd_token_revoke(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
