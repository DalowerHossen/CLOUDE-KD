-- path: migrations/S16_016_compliance.sql
-- Compliance: country restrictions and sanctions screening (platform level, company_id stays empty).
--   country_restrictions  one row per country the platform restricts, with a switch (enabled). Set by a platform admin, usually after
--                         a United Nations Security Council measure; the reference field keeps the resolution or notice.
--   sanctions_entries     the names of a sanctions list (OFAC or the UN list) in a normalized form that can be searched by token.
--   sanctions_sources     when each list was imported last and how many entries it holds.
-- kd_sanctions_replace swaps the whole content of one list in one transaction (the lists are published as complete files).

create table if not exists public.country_restrictions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  mode text not null default 'block' check (mode in ('block', 'review')),
  source text not null default 'manual' check (source in ('un_security_council', 'manual')),
  reference text not null default '' check (char_length(reference) <= 300),
  reason text not null check (char_length(reason) between 10 and 500),
  enabled boolean not null default true,
  changed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sanctions_entries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  source text not null check (source in ('ofac', 'un')),
  source_uid text not null check (char_length(source_uid) between 1 and 100),
  kind text not null check (kind in ('person', 'business')),
  name text not null check (char_length(name) between 1 and 500),
  aliases jsonb not null default '[]' check (jsonb_typeof(aliases) = 'array'),
  search_tokens text[] not null check (cardinality(search_tokens) between 1 and 400),
  countries text[] not null default '{}',
  programs text not null default '' check (char_length(programs) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sanctions_sources (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  source text not null check (source in ('ofac', 'un')),
  entry_count integer not null default 0 check (entry_count >= 0),
  imported_at timestamptz,
  imported_by uuid,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.country_restrictions');
select public.apply_standard_triggers('public.sanctions_entries');
select public.apply_standard_triggers('public.sanctions_sources');
select public.rls_enable_default_deny('public.country_restrictions');
select public.rls_enable_default_deny('public.sanctions_entries');
select public.rls_enable_default_deny('public.sanctions_sources');
select public.audit_enable_for('public.country_restrictions');
select public.audit_enable_for('public.sanctions_sources');

create unique index if not exists uq_country_restrictions on public.country_restrictions (country_code) where deleted_at is null;
create unique index if not exists uq_sanctions_entries on public.sanctions_entries (source, source_uid);
create index if not exists ix_sanctions_tokens on public.sanctions_entries using gin (search_tokens);
create unique index if not exists uq_sanctions_sources on public.sanctions_sources (source) where deleted_at is null;

-- Entries that share at least one token with the searched name (the application scores them).
create or replace function public.kd_sanctions_candidates(p_tokens text[], p_limit integer default 400)
returns table (id uuid, source text, kind text, name text, aliases jsonb, search_tokens text[], countries text[], programs text)
language sql
stable
set search_path = public
as $$
  select e.id, e.source, e.kind, e.name, e.aliases, e.search_tokens, e.countries, e.programs
  from public.sanctions_entries e
  where e.search_tokens && p_tokens and e.deleted_at is null
  limit greatest(1, least(p_limit, 2000))
$$;

-- Replaces every entry of one list with the given entries. The new list must not be much smaller than the old one
-- (a broken file must not empty a list); p_force skips that guard for an owner who decided it.
create or replace function public.kd_sanctions_replace(p_source text, p_entries jsonb, p_by uuid, p_note text, p_force boolean default false)
returns integer
language plpgsql
set search_path = public
as $$
declare v_old integer; v_new integer;
begin
  if p_source not in ('ofac', 'un') then raise exception 'unknown list' using errcode = '22023'; end if;
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'entries must be an array' using errcode = '22023'; end if;
  v_new := jsonb_array_length(p_entries);
  select count(*) into v_old from public.sanctions_entries where source = p_source;
  if not p_force and v_old > 0 and v_new * 2 < v_old then
    raise exception 'the new list is less than half of the old one' using errcode = '22023';
  end if;
  perform set_config('kd.allow_hard_delete', 'on', true);
  delete from public.sanctions_entries where source = p_source;
  perform set_config('kd.allow_hard_delete', 'off', true);
  insert into public.sanctions_entries (source, source_uid, kind, name, aliases, search_tokens, countries, programs)
  select p_source, x.source_uid, x.kind, x.name, coalesce(x.aliases, '[]'::jsonb), x.search_tokens, coalesce(x.countries, '{}'), coalesce(x.programs, '')
  from jsonb_to_recordset(p_entries) as x (source_uid text, kind text, name text, aliases jsonb, search_tokens text[], countries text[], programs text);
  insert into public.sanctions_sources (source, entry_count, imported_at, imported_by, note)
  values (p_source, v_new, now(), p_by, left(coalesce(p_note, ''), 300))
  on conflict (source) where deleted_at is null
  do update set entry_count = excluded.entry_count, imported_at = excluded.imported_at, imported_by = excluded.imported_by, note = excluded.note;
  return v_new;
end
$$;

revoke all on public.country_restrictions, public.sanctions_entries, public.sanctions_sources from authenticated;
grant all on public.country_restrictions, public.sanctions_entries, public.sanctions_sources to service_role;
revoke all on function public.kd_sanctions_candidates(text[], integer), public.kd_sanctions_replace(text, jsonb, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.kd_sanctions_candidates(text[], integer), public.kd_sanctions_replace(text, jsonb, uuid, text, boolean) to service_role;
