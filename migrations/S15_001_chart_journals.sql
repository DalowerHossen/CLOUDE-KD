-- path: migrations/S15_001_chart_journals.sql
-- STEP 15.1 Chart of accounts and journals.
--   accounts            the chart of a company (type, subtype, hierarchy, status). System accounts are protected.
--   account_history     every change of an account (append only).
--   account_mappings    which account a kind of transaction posts to (invoice receivable, payment bank, ...).
--   journal_entries     a journal entry: draft -> pending_approval -> posted. A posted entry never changes; it is undone by
--                       a reversing entry. The entry number is given when it is posted.
--   journal_lines       the lines of an entry: one side (debit or credit) per line. Debit equals credit is checked in the
--                       database before an entry leaves draft. Lines of an entry that is not a draft cannot change.
--   journal_counters    the entry number counter per company and year.
--   journal_templates   an entry saved for reuse.
--   journal_attachments a file (receipt, document) kept with an entry through the storage contract.
-- Errors of the functions: 22023 bad request, P0002 not found, 55000 wrong state, 23514 not balanced, KD001 duplicate
-- entry (the detail holds the id of the earlier entry), 23505 source key reused for another entry.

create table if not exists public.accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  code text not null check (code ~ '^[0-9]{3,10}$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype text not null,
  is_contra boolean not null default false,
  normal_side text generated always as (case when ((type in ('asset', 'expense')) <> is_contra) then 'debit' else 'credit' end) stored,
  parent_id uuid references public.accounts (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  allow_posting boolean not null default true,
  is_system boolean not null default false,
  system_key text check (system_key is null or system_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (
    (type = 'asset' and subtype in ('current_asset', 'fixed_asset', 'other_asset')) or
    (type = 'liability' and subtype in ('current_liability', 'long_term_liability')) or
    (type = 'equity' and subtype in ('owner_equity', 'retained_earnings')) or
    (type = 'revenue' and subtype in ('operating_revenue', 'other_income')) or
    (type = 'expense' and subtype in ('cost_of_sales', 'operating_expense', 'other_expense'))
  ),
  check (not is_system or system_key is not null)
);

create table if not exists public.account_history (
  -- guard:append-only (the change log of the chart; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  change text not null check (char_length(change) between 1 and 60),
  before jsonb,
  after jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.account_mappings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  mapping_key text not null check (mapping_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  account_id uuid not null references public.accounts (id) on delete restrict,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.journal_counters (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  year integer not null check (year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.journal_entries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entry_number text check (entry_number is null or entry_number ~ '^JE-\d{4}-\d{6}$'),
  entry_date date not null,
  memo text not null default '' check (char_length(memo) <= 500),
  internal_note text not null default '' check (char_length(internal_note) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'posted')),
  source text not null default 'manual' check (source in ('manual', 'system', 'import', 'reversal', 'recurring')),
  entry_kind text not null default 'normal' check (entry_kind in ('normal', 'adjusting', 'closing')),
  source_type text check (source_type is null or char_length(source_type) between 1 and 60),
  source_id text check (source_id is null or char_length(source_id) between 1 and 120),
  source_key text check (source_key is null or char_length(source_key) between 8 and 200),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  duplicate_of uuid references public.journal_entries (id) on delete restrict,
  total_amount numeric(18,4) not null default 0 check (total_amount >= 0),
  approval_request_id uuid,
  reverses_entry_id uuid references public.journal_entries (id) on delete restrict,
  reversed_by_id uuid references public.journal_entries (id) on delete restrict,
  reverse_reason text check (reverse_reason is null or char_length(reverse_reason) <= 300),
  created_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'posted') = (posted_at is not null)),
  check ((status = 'posted') = (entry_number is not null))
);

create table if not exists public.journal_lines (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entry_id uuid not null references public.journal_entries (id) on delete restrict,
  line_no integer not null check (line_no between 1 and 500),
  account_id uuid not null references public.accounts (id) on delete restrict,
  debit numeric(18,4) not null default 0 check (debit >= 0),
  credit numeric(18,4) not null default 0 check (credit >= 0),
  description text not null default '' check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((debit > 0) <> (credit > 0))
);

create table if not exists public.journal_templates (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  memo text not null default '' check (char_length(memo) <= 500),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 2 and 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.journal_attachments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  entry_id uuid not null references public.journal_entries (id) on delete restrict,
  file_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.accounts');
select public.apply_standard_triggers('public.account_mappings');
select public.apply_standard_triggers('public.journal_counters');
select public.apply_standard_triggers('public.journal_entries');
select public.apply_standard_triggers('public.journal_lines');
select public.apply_standard_triggers('public.journal_templates');
select public.apply_standard_triggers('public.journal_attachments');
select public.rls_enable_default_deny('public.accounts');
select public.rls_enable_default_deny('public.account_history');
select public.rls_enable_default_deny('public.account_mappings');
select public.rls_enable_default_deny('public.journal_counters');
select public.rls_enable_default_deny('public.journal_entries');
select public.rls_enable_default_deny('public.journal_lines');
select public.rls_enable_default_deny('public.journal_templates');
select public.rls_enable_default_deny('public.journal_attachments');
select public.audit_enable_for('public.accounts');
select public.audit_enable_for('public.account_mappings');
select public.audit_enable_for('public.journal_entries');
select public.audit_enable_for('public.journal_lines');
select public.audit_enable_for('public.journal_templates');
select public.audit_enable_for('public.journal_attachments');

drop trigger if exists trg_account_history_append on public.account_history;
create trigger trg_account_history_append before update or delete on public.account_history for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_accounts_code on public.accounts (company_id, code) where deleted_at is null;
create unique index if not exists uq_accounts_system_key on public.accounts (company_id, system_key) where deleted_at is null and system_key is not null;
create index if not exists ix_accounts_parent on public.accounts (parent_id) where deleted_at is null;
create index if not exists ix_accounts_company on public.accounts (company_id, type, code) where deleted_at is null;
create index if not exists ix_account_history on public.account_history (account_id, created_at desc);
create unique index if not exists uq_account_mappings on public.account_mappings (company_id, mapping_key) where deleted_at is null;
create unique index if not exists uq_journal_counters on public.journal_counters (company_id, year) where deleted_at is null;
create unique index if not exists uq_journal_number on public.journal_entries (company_id, entry_number) where entry_number is not null and deleted_at is null;
create unique index if not exists uq_journal_source_key on public.journal_entries (company_id, source_key) where source_key is not null and deleted_at is null;
create index if not exists ix_journal_entries_date on public.journal_entries (company_id, entry_date desc, created_at desc) where deleted_at is null;
create index if not exists ix_journal_entries_hash on public.journal_entries (company_id, content_hash) where deleted_at is null;
create index if not exists ix_journal_entries_source on public.journal_entries (company_id, source_type, source_id) where deleted_at is null;
create unique index if not exists uq_journal_lines_no on public.journal_lines (entry_id, line_no) where deleted_at is null;
create index if not exists ix_journal_lines_entry on public.journal_lines (entry_id) where deleted_at is null;
create index if not exists ix_journal_lines_account on public.journal_lines (company_id, account_id) where deleted_at is null;
create unique index if not exists uq_journal_templates_name on public.journal_templates (company_id, lower(name)) where deleted_at is null;
create index if not exists ix_journal_attachments on public.journal_attachments (entry_id) where deleted_at is null;

-- Account rules: the parent is in the same company and of the same type, the tree has no loop and is at most 6 deep,
-- a system account keeps its code, type and key, and an account with lines keeps its type and cannot be removed.
create or replace function public.kd_accounts_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.accounts;
  v_depth integer := 1;
  v_cur uuid;
  v_lines integer;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'an account cannot be its own parent' using errcode = '22023'; end if;
    select * into v_parent from public.accounts where id = new.parent_id and deleted_at is null;
    if not found or v_parent.company_id <> new.company_id then raise exception 'the parent account was not found' using errcode = 'P0002'; end if;
    if v_parent.type <> new.type then raise exception 'the parent account must have the same type' using errcode = '22023'; end if;
    v_cur := v_parent.parent_id;
    while v_cur is not null loop
      v_depth := v_depth + 1;
      if v_cur = new.id or v_depth > 6 then raise exception 'the account tree has a loop or is too deep' using errcode = '22023'; end if;
      select parent_id into v_cur from public.accounts where id = v_cur;
    end loop;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_system and (new.code <> old.code or new.type <> old.type or new.system_key is distinct from old.system_key
       or new.is_system is distinct from old.is_system or (new.deleted_at is not null and old.deleted_at is null)) then
      raise exception 'a system account keeps its code, type and key and cannot be removed' using errcode = '55000';
    end if;
    if new.type <> old.type or new.is_contra <> old.is_contra or (new.deleted_at is not null and old.deleted_at is null) then
      select count(*) into v_lines from public.journal_lines where account_id = old.id and deleted_at is null;
      if v_lines > 0 then raise exception 'an account with journal lines keeps its type and cannot be removed' using errcode = '55000'; end if;
    end if;
    if new.allow_posting = false and old.allow_posting then
      select count(*) into v_lines from public.journal_lines where account_id = old.id and deleted_at is null;
      if v_lines > 0 then raise exception 'an account with journal lines must allow posting' using errcode = '55000'; end if;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_accounts_guard on public.accounts;
create trigger trg_accounts_guard before insert or update on public.accounts for each row execute function public.kd_accounts_guard();

-- Lines: only on a draft entry, only on a live posting account of the same company.
create or replace function public.kd_journal_line_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_acc public.accounts;
  v_entry_id uuid := coalesce(new.entry_id, old.entry_id);
begin
  select * into v_entry from public.journal_entries where id = v_entry_id;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if v_entry.status <> 'draft' then raise exception 'only the lines of a draft entry can change' using errcode = '55000'; end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.account_id <> old.account_id) then
    select * into v_acc from public.accounts where id = new.account_id and deleted_at is null;
    if not found or v_acc.company_id <> new.company_id or v_acc.company_id <> v_entry.company_id then
      raise exception 'the account was not found' using errcode = 'P0002';
    end if;
    if v_acc.status <> 'active' or not v_acc.allow_posting then
      raise exception 'account % does not accept postings', v_acc.code using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_journal_lines_guard on public.journal_lines;
create trigger trg_journal_lines_guard before insert or update on public.journal_lines for each row execute function public.kd_journal_line_guard();

-- Entries: leaving draft needs two or more live lines whose debits equal the credits; a posted entry changes only to be
-- marked as reversed; only a draft can be removed.
create or replace function public.kd_journal_entry_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_debit numeric;
  v_credit numeric;
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'posted' then
      if new.status <> 'posted' or new.deleted_at is distinct from old.deleted_at or new.entry_date <> old.entry_date
         or new.memo <> old.memo or new.entry_number is distinct from old.entry_number or new.content_hash <> old.content_hash
         or new.total_amount <> old.total_amount or new.source <> old.source or new.company_id <> old.company_id
         or new.entry_kind <> old.entry_kind or new.source_key is distinct from old.source_key or new.reverses_entry_id is distinct from old.reverses_entry_id
         or (old.reversed_by_id is not null and new.reversed_by_id is distinct from old.reversed_by_id) then
        raise exception 'a posted entry cannot change; reverse it instead' using errcode = '55000';
      end if;
      return new;
    end if;
    if new.deleted_at is not null and old.deleted_at is null and old.status <> 'draft' then
      raise exception 'only a draft entry can be removed' using errcode = '55000';
    end if;
    if new.status in ('pending_approval', 'posted') and new.status <> old.status then
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into v_debit, v_credit, v_count
        from public.journal_lines where entry_id = new.id and deleted_at is null;
      if v_count < 2 then raise exception 'an entry needs at least two lines' using errcode = '23514'; end if;
      if v_debit <> v_credit then raise exception 'debits % and credits % are not equal', v_debit, v_credit using errcode = '23514'; end if;
      if v_debit = 0 then raise exception 'an entry cannot be zero' using errcode = '23514'; end if;
      new.total_amount := v_debit;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_journal_entries_guard on public.journal_entries;
create trigger trg_journal_entries_guard before update on public.journal_entries for each row execute function public.kd_journal_entry_guard();

-- Next entry number of the company for a year (JE-2026-000001).
create or replace function public.kd_journal_number(p_company uuid, p_year integer) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_next integer;
begin
  insert into public.journal_counters (company_id, year, last_number) values (p_company, p_year, 1)
    on conflict (company_id, year) where deleted_at is null do update set last_number = public.journal_counters.last_number + 1
    returning last_number into v_next;
  return 'JE-' || p_year::text || '-' || lpad(v_next::text, 6, '0');
end
$$;

-- Posts a draft or pending entry. Safe to call twice (a posted entry answers as a replay).
create or replace function public.kd_journal_post(p_company uuid, p_entry uuid, p_actor uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.journal_entries;
  v_acc integer;
begin
  select * into v_e from public.journal_entries where id = p_entry and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if v_e.status = 'posted' then return jsonb_build_object('entry_id', v_e.id, 'number', v_e.entry_number, 'replay', true); end if;
  select count(*) into v_acc from public.journal_lines l join public.accounts a on a.id = l.account_id
    where l.entry_id = p_entry and l.deleted_at is null and (a.status <> 'active' or not a.allow_posting or a.deleted_at is not null);
  if v_acc > 0 then raise exception 'a line uses an account that does not accept postings' using errcode = '55000'; end if;
  -- the guard checks the balance when the status changes; status goes to pending first so the lines freeze
  update public.journal_entries set status = 'posted', posted_by = p_actor, posted_at = now(),
    entry_number = public.kd_journal_number(p_company, extract(year from v_e.entry_date)::integer)
    where id = p_entry returning * into v_e;
  return jsonb_build_object('entry_id', v_e.id, 'number', v_e.entry_number, 'replay', false);
end
$$;

-- Makes an entry with its lines in one step. p_lines: [{ "account_id": uuid, "debit": "10.0000", "credit": "0", "description": "" }].
-- p_status: draft, pending_approval or posted. The same source key returns the first entry (a replay). A manual or imported
-- entry with the same date and lines as an earlier one is refused with KD001 unless p_allow_duplicate is true.
create or replace function public.kd_journal_create(
  p_company uuid, p_date date, p_memo text, p_source text, p_source_type text, p_source_id text, p_source_key text,
  p_lines jsonb, p_actor uuid, p_status text default 'draft', p_allow_duplicate boolean default false,
  p_note text default '', p_reverses uuid default null, p_reason text default null, p_kind text default 'normal'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_old public.journal_entries;
  v_dup_id uuid;
  v_id uuid;
  v_line jsonb;
  v_no integer := 0;
  v_post jsonb;
  v_debit numeric;
  v_credit numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 or jsonb_array_length(p_lines) > 200 then
    raise exception 'an entry needs between 2 and 200 lines' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'pending_approval', 'posted') then raise exception 'bad status' using errcode = '22023'; end if;
  if p_kind not in ('normal', 'adjusting', 'closing') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_source_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':je:' || p_source_key, 0));
    select * into v_old from public.journal_entries where company_id = p_company and source_key = p_source_key and deleted_at is null;
    if found then return jsonb_build_object('entry_id', v_old.id, 'replay', true, 'status', v_old.status, 'number', v_old.entry_number); end if;
  end if;
  select encode(sha256(convert_to(p_date::text || '|' || string_agg(
      (l->>'account_id') || ':' || (coalesce((l->>'debit')::numeric, 0))::text || ':' || (coalesce((l->>'credit')::numeric, 0))::text, ',' order by
      (l->>'account_id'), coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0)), 'UTF8')), 'hex')
    into v_hash from jsonb_array_elements(p_lines) l;
  if p_source in ('manual', 'import') then
    select id into v_dup_id from public.journal_entries
      where company_id = p_company and content_hash = v_hash and deleted_at is null and source in ('manual', 'import')
        and reversed_by_id is null limit 1;
    if v_dup_id is not null and not p_allow_duplicate then
      raise exception 'an entry with the same date and lines exists' using errcode = 'KD001', detail = v_dup_id::text;
    end if;
  end if;
  insert into public.journal_entries (company_id, entry_date, memo, internal_note, status, source, entry_kind, source_type, source_id, source_key,
      content_hash, duplicate_of, reverses_entry_id, reverse_reason, created_by)
    values (p_company, p_date, coalesce(p_memo, ''), coalesce(p_note, ''), 'draft', p_source, p_kind, p_source_type, p_source_id, p_source_key,
      v_hash, v_dup_id, p_reverses, p_reason, p_actor)
    returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.journal_lines (company_id, entry_id, line_no, account_id, debit, credit, description)
      values (p_company, v_id, v_no, (v_line->>'account_id')::uuid, coalesce((v_line->>'debit')::numeric, 0),
              coalesce((v_line->>'credit')::numeric, 0), coalesce(v_line->>'description', ''));
  end loop;
  if p_status = 'posted' then
    v_post := public.kd_journal_post(p_company, v_id, p_actor);
    return jsonb_build_object('entry_id', v_id, 'replay', false, 'status', 'posted', 'number', v_post->>'number');
  elsif p_status = 'pending_approval' then
    update public.journal_entries set status = 'pending_approval' where id = v_id;
  end if;
  return jsonb_build_object('entry_id', v_id, 'replay', false, 'status', p_status);
end
$$;

-- Replaces the lines of a draft entry (the old lines are removed, the new ones added) and refreshes the duplicate hash.
create or replace function public.kd_journal_replace(
  p_company uuid, p_entry uuid, p_version integer, p_date date, p_memo text, p_note text, p_lines jsonb, p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.journal_entries;
  v_line jsonb;
  v_no integer := 0;
  v_hash text;
begin
  select * into v_e from public.journal_entries where id = p_entry and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if v_e.status <> 'draft' then raise exception 'only a draft entry can change' using errcode = '55000'; end if;
  if v_e.version <> p_version then raise exception 'the entry was changed by someone else' using errcode = '40001'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 or jsonb_array_length(p_lines) > 200 then
    raise exception 'an entry needs between 2 and 200 lines' using errcode = '22023';
  end if;
  update public.journal_lines set deleted_at = now() where entry_id = p_entry and deleted_at is null;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.journal_lines (company_id, entry_id, line_no, account_id, debit, credit, description)
      values (p_company, p_entry, v_no, (v_line->>'account_id')::uuid, coalesce((v_line->>'debit')::numeric, 0),
              coalesce((v_line->>'credit')::numeric, 0), coalesce(v_line->>'description', ''));
  end loop;
  select encode(sha256(convert_to(p_date::text || '|' || string_agg(
      (l->>'account_id') || ':' || (coalesce((l->>'debit')::numeric, 0))::text || ':' || (coalesce((l->>'credit')::numeric, 0))::text, ',' order by
      (l->>'account_id'), coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0)), 'UTF8')), 'hex')
    into v_hash from jsonb_array_elements(p_lines) l;
  update public.journal_entries set entry_date = p_date, memo = coalesce(p_memo, ''), internal_note = coalesce(p_note, ''), content_hash = v_hash
    where id = p_entry;
  return jsonb_build_object('entry_id', p_entry);
end
$$;

-- Reverses a posted entry: a new posted entry with debit and credit swapped, dated p_date, linked both ways. Once only.
create or replace function public.kd_journal_reverse(p_company uuid, p_entry uuid, p_date date, p_reason text, p_actor uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.journal_entries;
  v_lines jsonb;
  v_new jsonb;
begin
  select * into v_e from public.journal_entries where id = p_entry and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if v_e.status <> 'posted' then raise exception 'only a posted entry can be reversed' using errcode = '55000'; end if;
  if v_e.reversed_by_id is not null then raise exception 'the entry is already reversed' using errcode = '55000'; end if;
  if v_e.source = 'reversal' then raise exception 'a reversing entry cannot be reversed' using errcode = '55000'; end if;
  select jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit::text, 'credit', debit::text, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = p_entry and deleted_at is null;
  v_new := public.kd_journal_create(p_company, p_date, 'Reversal of ' || v_e.entry_number || ': ' || coalesce(p_reason, ''), 'reversal',
    'journal_entry', p_entry::text, 'reverse:' || p_entry::text, v_lines, p_actor, 'posted', true, '', p_entry, p_reason, v_e.entry_kind);
  update public.journal_entries set reversed_by_id = (v_new->>'entry_id')::uuid where id = p_entry;
  return v_new;
end
$$;

-- Trial balance sums: debit and credit per account up to a date (posted entries only).
create or replace function public.kd_journal_balances(p_company uuid, p_to date) returns table (account_id uuid, debit numeric, credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select l.account_id, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.company_id = p_company and l.deleted_at is null and e.deleted_at is null and e.status = 'posted'
    and (p_to is null or e.entry_date <= p_to)
  group by l.account_id
$$;

revoke all on public.accounts, public.account_history, public.account_mappings, public.journal_counters, public.journal_entries,
  public.journal_lines, public.journal_templates, public.journal_attachments from authenticated;
grant all on public.accounts, public.account_history, public.account_mappings, public.journal_counters, public.journal_entries,
  public.journal_lines, public.journal_templates, public.journal_attachments to service_role;
revoke execute on function public.kd_journal_number(uuid, integer) from public, anon, authenticated;
revoke execute on function public.kd_journal_post(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.kd_journal_create(uuid, date, text, text, text, text, text, jsonb, uuid, text, boolean, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.kd_journal_replace(uuid, uuid, integer, date, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.kd_journal_reverse(uuid, uuid, date, text, uuid) from public, anon, authenticated;
revoke execute on function public.kd_journal_balances(uuid, date) from public, anon, authenticated;
grant execute on function public.kd_journal_number(uuid, integer) to service_role;
grant execute on function public.kd_journal_post(uuid, uuid, uuid) to service_role;
grant execute on function public.kd_journal_create(uuid, date, text, text, text, text, text, jsonb, uuid, text, boolean, text, uuid, text, text) to service_role;
grant execute on function public.kd_journal_replace(uuid, uuid, integer, date, text, text, jsonb, uuid) to service_role;
grant execute on function public.kd_journal_reverse(uuid, uuid, date, text, uuid) to service_role;
grant execute on function public.kd_journal_balances(uuid, date) to service_role;
