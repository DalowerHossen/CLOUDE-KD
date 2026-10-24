-- path: migrations/S04_002_network_intel.sql
-- STEP 04.5 Network intelligence: cached IP reputation, Tor exit list, administrator whitelist of corporate networks.
-- Addresses are stored as keyed hashes. Only whitelist entries keep the network range in clear text (an administrator enters it).

create table if not exists public.ip_reputation (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  kind text not null check (kind in ('reputation', 'tor_exit', 'whitelist')),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  cidr cidr,
  score integer not null default 0 check (score between 0 and 100),
  flags jsonb not null default '{}'::jsonb,
  country_code char(2),
  source text not null default '' check (char_length(source) <= 60),
  note text not null default '' check (char_length(note) <= 300),
  checked_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((kind = 'whitelist' and cidr is not null) or (kind <> 'whitelist' and ip_hash is not null))
);

select public.rls_enable_default_deny('public.ip_reputation');
create unique index if not exists uq_ip_reputation_hash on public.ip_reputation (kind, ip_hash) where ip_hash is not null and deleted_at is null;
create unique index if not exists uq_ip_reputation_cidr on public.ip_reputation (cidr) where kind = 'whitelist' and deleted_at is null;
create index if not exists ix_ip_reputation_expiry on public.ip_reputation (expires_at) where expires_at is not null;
revoke all on public.ip_reputation from authenticated;
grant all on public.ip_reputation to service_role;
select public.audit_enable_for('public.ip_reputation');

create or replace function public.kd_network_whitelisted(p_ip text) returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.ip_reputation where kind = 'whitelist' and deleted_at is null and p_ip::inet <<= cidr);
exception when invalid_text_representation then
  return false;
end
$$;

create or replace function public.kd_reputation_get(p_ip_hash text) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('kind', kind, 'score', score, 'flags', flags, 'countryCode', country_code)
     from public.ip_reputation
     where ip_hash = p_ip_hash and kind in ('reputation', 'tor_exit') and deleted_at is null and (expires_at is null or expires_at > now())
     order by case kind when 'tor_exit' then 0 else 1 end limit 1),
    'null'::jsonb)
$$;

create or replace function public.kd_reputation_put(p_ip_hash text, p_score integer, p_flags jsonb, p_country text, p_source text, p_ttl_seconds integer) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.ip_reputation as r (kind, ip_hash, score, flags, country_code, source, checked_at, expires_at)
  values ('reputation', p_ip_hash, p_score, p_flags, nullif(p_country, ''), p_source, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (kind, ip_hash) where ip_hash is not null and deleted_at is null do update
    set score = excluded.score, flags = excluded.flags, country_code = excluded.country_code, source = excluded.source,
        checked_at = now(), expires_at = excluded.expires_at;
end
$$;

-- Replaces the Tor exit list: inserts the new hashes, refreshes their expiry and removes the ones that left the list.
create or replace function public.kd_tor_replace(p_hashes text[], p_ttl_seconds integer) returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('kd.allow_hard_delete', 'on', true);
  insert into public.ip_reputation (kind, ip_hash, score, flags, source, expires_at)
  select 'tor_exit', h, 100, '{"tor":true,"proxy":true}'::jsonb, 'tor-exit-list', now() + make_interval(secs => p_ttl_seconds)
  from unnest(p_hashes) as h
  on conflict (kind, ip_hash) where ip_hash is not null and deleted_at is null do update
    set expires_at = excluded.expires_at, checked_at = now();
  delete from public.ip_reputation where kind = 'tor_exit' and not (ip_hash = any (p_hashes));
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.kd_reputation_purge() returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  perform set_config('kd.allow_hard_delete', 'on', true);
  delete from public.ip_reputation where kind = 'reputation' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.kd_network_whitelisted(text)', 'public.kd_reputation_get(text)',
    'public.kd_reputation_put(text, integer, jsonb, text, text, integer)', 'public.kd_tor_replace(text[], integer)', 'public.kd_reputation_purge()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Whitelist entry from administrator input ("203.0.113.5/24" becomes the network 203.0.113.0/24).
create or replace function public.kd_whitelist_add(p_cidr text, p_note text, p_by uuid) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare net cidr; wid uuid;
begin
  net := network(p_cidr::inet)::cidr;
  if family(net) = 4 and masklen(net) < 8 then
    raise exception 'range too wide' using errcode = '22023';
  end if;
  if family(net) = 6 and masklen(net) < 32 then
    raise exception 'range too wide' using errcode = '22023';
  end if;
  insert into public.ip_reputation (kind, cidr, note, created_by) values ('whitelist', net, left(coalesce(p_note, ''), 300), p_by)
  on conflict (cidr) where kind = 'whitelist' and deleted_at is null do update set note = excluded.note
  returning id into wid;
  return wid;
exception when invalid_text_representation then
  raise exception 'invalid network' using errcode = '22023';
end
$$;
revoke execute on function public.kd_whitelist_add(text, text, uuid) from public, anon, authenticated;
grant execute on function public.kd_whitelist_add(text, text, uuid) to service_role;
