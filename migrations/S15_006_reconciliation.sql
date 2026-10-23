-- path: migrations/S15_006_reconciliation.sql
-- STEP 15.6 Bank reconciliation.
--   bank_accounts       a bank account of the company, tied to a cash account of the chart. Only the last 4 digits are kept.
--   bank_imports        one imported statement file (CSV, OFX, QFX) or feed batch; the same file is refused twice.
--   bank_transactions   a line of the bank statement. Amount is signed: a deposit is positive, a payment is negative. A line
--                       the same account already has (same date, amount, text and external id) is skipped.
--   bank_matches        a bank line matched to a journal line of the bank's ledger account (one journal line once).
--   bank_rules          a rule that books a bank line to an account when its text matches (bank fees, interest).
--   reconciliations     a statement date and balance for an account; completing it needs a zero difference and locks the lines.
-- Lines of a completed reconciliation cannot be matched, unmatched or changed.

create table if not exists public.bank_accounts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  bank_name text not null default '' check (char_length(bank_name) <= 100),
  last4 text check (last4 is null or last4 ~ '^[0-9]{1,4}$'),
  currency text not null default 'USD' check (currency = 'USD'),
  ledger_account_id uuid not null references public.accounts (id) on delete restrict,
  opening_balance numeric(18,4) not null default 0,
  opening_date date,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.bank_imports (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  source text not null check (source in ('csv', 'ofx', 'qfx', 'feed')),
  file_name text not null default '' check (char_length(file_name) <= 200),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  period_from date,
  period_to date,
  ending_balance numeric(18,4),
  imported_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.reconciliations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  statement_date date not null,
  statement_balance numeric(18,4) not null,
  opening_balance numeric(18,4) not null,
  cleared_total numeric(18,4) not null default 0,
  difference numeric(18,4) not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  note text not null default '' check (char_length(note) <= 500),
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'completed') = (completed_at is not null)),
  check (status <> 'completed' or difference = 0)
);

create table if not exists public.bank_transactions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  import_id uuid references public.bank_imports (id) on delete restrict,
  txn_date date not null,
  description text not null default '' check (char_length(description) <= 500),
  reference text not null default '' check (char_length(reference) <= 120),
  external_id text check (external_id is null or char_length(external_id) <= 120),
  amount numeric(18,4) not null check (amount <> 0),
  balance_after numeric(18,4),
  dedupe_hash text not null check (dedupe_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  reconciliation_id uuid references public.reconciliations (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (reconciliation_id is null or status <> 'unmatched')
);

create table if not exists public.bank_matches (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  bank_transaction_id uuid not null references public.bank_transactions (id) on delete restrict,
  journal_line_id uuid not null references public.journal_lines (id) on delete restrict,
  amount numeric(18,4) not null check (amount <> 0),
  method text not null check (method in ('auto', 'manual', 'rule', 'adjustment')),
  matched_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.bank_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  bank_account_id uuid references public.bank_accounts (id) on delete restrict,
  contains_text text not null check (char_length(contains_text) between 2 and 100),
  direction text not null default 'any' check (direction in ('any', 'in', 'out')),
  account_id uuid not null references public.accounts (id) on delete restrict,
  memo text not null default '' check (char_length(memo) <= 200),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.bank_accounts');
select public.apply_standard_triggers('public.bank_imports');
select public.apply_standard_triggers('public.reconciliations');
select public.apply_standard_triggers('public.bank_transactions');
select public.apply_standard_triggers('public.bank_matches');
select public.apply_standard_triggers('public.bank_rules');
select public.rls_enable_default_deny('public.bank_accounts');
select public.rls_enable_default_deny('public.bank_imports');
select public.rls_enable_default_deny('public.reconciliations');
select public.rls_enable_default_deny('public.bank_transactions');
select public.rls_enable_default_deny('public.bank_matches');
select public.rls_enable_default_deny('public.bank_rules');
select public.audit_enable_for('public.bank_accounts');
select public.audit_enable_for('public.bank_imports');
select public.audit_enable_for('public.reconciliations');
select public.audit_enable_for('public.bank_transactions');
select public.audit_enable_for('public.bank_matches');
select public.audit_enable_for('public.bank_rules');

create index if not exists ix_bank_accounts_company on public.bank_accounts (company_id) where deleted_at is null;
create unique index if not exists uq_bank_imports_file on public.bank_imports (bank_account_id, file_hash) where deleted_at is null;
create unique index if not exists uq_bank_transactions_dedupe on public.bank_transactions (bank_account_id, dedupe_hash) where deleted_at is null;
create index if not exists ix_bank_transactions_status on public.bank_transactions (bank_account_id, status, txn_date) where deleted_at is null;
create unique index if not exists uq_bank_matches_line on public.bank_matches (journal_line_id) where deleted_at is null;
create index if not exists ix_bank_matches_txn on public.bank_matches (bank_transaction_id) where deleted_at is null;
create unique index if not exists uq_reconciliations_open on public.reconciliations (bank_account_id) where status = 'in_progress' and deleted_at is null;
create index if not exists ix_reconciliations_account on public.reconciliations (bank_account_id, statement_date desc) where deleted_at is null;
create index if not exists ix_bank_rules_company on public.bank_rules (company_id) where deleted_at is null;

-- The ledger account of a bank account is a cash account of the same company; a rule posts to a postable account.
create or replace function public.kd_bank_account_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_acc public.accounts;
begin
  select * into v_acc from public.accounts where id = new.ledger_account_id and deleted_at is null;
  if not found or v_acc.company_id <> new.company_id then raise exception 'the ledger account was not found' using errcode = 'P0002'; end if;
  if v_acc.type <> 'asset' or not v_acc.is_cash or not v_acc.allow_posting then
    raise exception 'a bank account is tied to a cash account of the chart' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.ledger_account_id <> old.ledger_account_id and exists (select 1 from public.bank_transactions where bank_account_id = old.id and deleted_at is null) then
    raise exception 'the ledger account cannot change once the account has bank lines' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_bank_accounts_guard on public.bank_accounts;
create trigger trg_bank_accounts_guard before insert or update on public.bank_accounts for each row execute function public.kd_bank_account_guard();

-- A bank line, once reconciled, does not change its amount, date or status; a match of a reconciled line does not change.
create or replace function public.kd_bank_transaction_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.reconciliation_id is not null then
    if new.amount <> old.amount or new.txn_date <> old.txn_date or new.status <> old.status
       or new.reconciliation_id is distinct from old.reconciliation_id or new.deleted_at is distinct from old.deleted_at then
      raise exception 'a reconciled bank line cannot change' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_bank_transactions_guard on public.bank_transactions;
create trigger trg_bank_transactions_guard before update on public.bank_transactions for each row execute function public.kd_bank_transaction_guard();

create or replace function public.kd_bank_match_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_txn public.bank_transactions;
  v_line public.journal_lines;
  v_acc uuid;
  v_ledger uuid;
  v_status text;
begin
  select * into v_txn from public.bank_transactions where id = coalesce(new.bank_transaction_id, old.bank_transaction_id);
  if v_txn.reconciliation_id is not null then raise exception 'a reconciled bank line cannot be matched or unmatched' using errcode = '55000'; end if;
  if tg_op = 'INSERT' then
    select * into v_line from public.journal_lines where id = new.journal_line_id and deleted_at is null;
    if not found or v_line.company_id <> new.company_id then raise exception 'the journal line was not found' using errcode = 'P0002'; end if;
    select ledger_account_id into v_ledger from public.bank_accounts where id = v_txn.bank_account_id;
    if v_line.account_id <> v_ledger then raise exception 'the journal line is not on the ledger account of this bank account' using errcode = '22023'; end if;
    select status into v_status from public.journal_entries where id = v_line.entry_id;
    if v_status <> 'posted' then raise exception 'only a posted entry can be matched' using errcode = '55000'; end if;
    if new.amount <> (v_line.debit - v_line.credit) then raise exception 'the match amount must equal the journal line' using errcode = '22023'; end if;
  end if;
  return coalesce(new, old);
end
$$;
drop trigger if exists trg_bank_matches_guard on public.bank_matches;
create trigger trg_bank_matches_guard before insert or update or delete on public.bank_matches for each row execute function public.kd_bank_match_guard();

-- Sets a bank line to matched or unmatched from its matches: matched when the matches add up to the amount.
create or replace function public.kd_bank_refresh_status(p_txn uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.bank_transactions;
  v_sum numeric;
  v_status text;
begin
  select * into v_t from public.bank_transactions where id = p_txn for update;
  if not found then raise exception 'bank line not found' using errcode = 'P0002'; end if;
  if v_t.status = 'ignored' then return 'ignored'; end if;
  select coalesce(sum(amount), 0) into v_sum from public.bank_matches where bank_transaction_id = p_txn and deleted_at is null;
  v_status := case when v_sum = v_t.amount then 'matched' else 'unmatched' end;
  if v_status <> v_t.status then update public.bank_transactions set status = v_status where id = p_txn; end if;
  return v_status;
end
$$;

-- Starts a reconciliation up to a statement date. The opening balance is the ending balance of the last completed one, or the
-- account's opening balance.
create or replace function public.kd_reconciliation_start(p_company uuid, p_account uuid, p_date date, p_balance numeric, p_actor uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc public.bank_accounts;
  v_last public.reconciliations;
  v_open numeric;
  v_id uuid;
begin
  select * into v_acc from public.bank_accounts where id = p_account and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'bank account not found' using errcode = 'P0002'; end if;
  if v_acc.status <> 'active' then raise exception 'the bank account is closed' using errcode = '55000'; end if;
  select * into v_last from public.reconciliations where bank_account_id = p_account and status = 'completed' and deleted_at is null order by statement_date desc limit 1;
  if found then
    if p_date <= v_last.statement_date then raise exception 'the statement date must be after %', v_last.statement_date using errcode = '22023'; end if;
    v_open := v_last.statement_balance;
  else
    v_open := v_acc.opening_balance;
  end if;
  insert into public.reconciliations (company_id, bank_account_id, statement_date, statement_balance, opening_balance, created_by)
    values (p_company, p_account, p_date, p_balance, v_open, p_actor) returning id into v_id;
  return v_id;
end
$$;

-- The state of an open reconciliation: the lines up to the statement date that are not reconciled yet, how many are unmatched,
-- the total of the lines and the difference from the statement balance.
create or replace function public.kd_reconciliation_state(p_company uuid, p_rec uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r public.reconciliations;
  v_total numeric;
  v_unmatched integer;
  v_count integer;
begin
  select * into v_r from public.reconciliations where id = p_rec and company_id = p_company and deleted_at is null;
  if not found then raise exception 'reconciliation not found' using errcode = 'P0002'; end if;
  select coalesce(sum(amount), 0), count(*), count(*) filter (where status = 'unmatched')
    into v_total, v_count, v_unmatched
    from public.bank_transactions
    where bank_account_id = v_r.bank_account_id and deleted_at is null and status <> 'ignored'
      and (reconciliation_id = p_rec or (reconciliation_id is null and txn_date <= v_r.statement_date));
  return jsonb_build_object('lines', v_count, 'unmatched', v_unmatched, 'cleared_total', v_total,
    'expected', v_r.statement_balance - v_r.opening_balance, 'difference', v_r.statement_balance - v_r.opening_balance - v_total);
end
$$;

-- Completes a reconciliation: no unmatched line, difference zero. Its lines are tied to it and can no longer change.
create or replace function public.kd_reconciliation_complete(p_company uuid, p_rec uuid, p_actor uuid, p_note text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.reconciliations;
  v_state jsonb;
begin
  select * into v_r from public.reconciliations where id = p_rec and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'reconciliation not found' using errcode = 'P0002'; end if;
  if v_r.status = 'completed' then return jsonb_build_object('reconciliation_id', v_r.id, 'replay', true); end if;
  v_state := public.kd_reconciliation_state(p_company, p_rec);
  if (v_state->>'unmatched')::integer > 0 then raise exception '% bank lines are still unmatched', v_state->>'unmatched' using errcode = '55000'; end if;
  if (v_state->>'difference')::numeric <> 0 then raise exception 'the difference is %, it must be zero', v_state->>'difference' using errcode = '23514'; end if;
  update public.bank_transactions set reconciliation_id = p_rec
    where bank_account_id = v_r.bank_account_id and deleted_at is null and status <> 'ignored' and reconciliation_id is null and txn_date <= v_r.statement_date;
  update public.reconciliations set status = 'completed', completed_at = now(), completed_by = p_actor, note = coalesce(p_note, ''),
    cleared_total = (v_state->>'cleared_total')::numeric, difference = 0 where id = p_rec;
  return jsonb_build_object('reconciliation_id', v_r.id, 'replay', false);
end
$$;

revoke all on public.bank_accounts, public.bank_imports, public.reconciliations, public.bank_transactions, public.bank_matches, public.bank_rules from authenticated;
grant all on public.bank_accounts, public.bank_imports, public.reconciliations, public.bank_transactions, public.bank_matches, public.bank_rules to service_role;
revoke execute on function public.kd_bank_refresh_status(uuid) from public, anon, authenticated;
revoke execute on function public.kd_reconciliation_start(uuid, uuid, date, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.kd_reconciliation_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.kd_reconciliation_complete(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_bank_refresh_status(uuid) to service_role;
grant execute on function public.kd_reconciliation_start(uuid, uuid, date, numeric, uuid) to service_role;
grant execute on function public.kd_reconciliation_state(uuid, uuid) to service_role;
grant execute on function public.kd_reconciliation_complete(uuid, uuid, uuid, text) to service_role;
