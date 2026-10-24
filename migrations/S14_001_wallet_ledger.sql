-- path: migrations/S14_001_wallet_ledger.sql
-- STEP 14.1 Wallet and ledger.
--   wallets          one per company; the two balances are kept by the posting function only and always equal the
--                    sum of the ledger (checked by the assertion).
--   wallet_postings  one row per money movement, with the idempotency key and a hash of the request (append only).
--   ledger_entries   the legs of a posting; the legs of one posting add up to zero (checked at commit); append only.
--   wallet_holds     money set aside until a release time, with the reason the owner sees.
--   fee_schedules    the platform fee model: one platform default (company_id null) and optional per-company overrides.
-- Sign convention: a positive leg on a company account is money the platform owes to the company; the counter legs on
-- the platform accounts carry the opposite sign, so every posting sums to zero.
--   company accounts:  available, held
--   platform accounts: processor_receivable, platform_fee_revenue, processor_fee_expense, payout_in_transit, clearing

create table if not exists public.wallets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  currency text not null default 'USD' check (currency = 'USD'),
  available_balance numeric(18,4) not null default 0,
  held_balance numeric(18,4) not null default 0 check (held_balance >= 0),
  low_balance_threshold numeric(18,4) check (low_balance_threshold is null or low_balance_threshold >= 0),
  low_alerted_at timestamptz,
  negative_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.wallet_postings (
  -- guard:append-only (one money movement; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) between 1 and 200),
  reference_type text not null check (char_length(reference_type) between 1 and 60),
  reference_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  -- guard:append-only (a leg of a posting; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  posting_id uuid not null references public.wallet_postings (id) on delete restrict,
  wallet_id uuid references public.wallets (id) on delete restrict,
  account_code text not null check (account_code in ('available', 'held', 'processor_receivable', 'platform_fee_revenue', 'processor_fee_expense', 'payout_in_transit', 'clearing')),
  amount numeric(18,4) not null check (amount <> 0),
  created_at timestamptz not null default now(),
  check ((wallet_id is not null) = (account_code in ('available', 'held')))
);

create table if not exists public.wallet_holds (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  posting_id uuid not null references public.wallet_postings (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  reason text not null check (char_length(reason) between 1 and 300),
  source text not null default 'manual' check (source in ('settlement', 'manual', 'risk')),
  release_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'released')),
  released_at timestamptz,
  released_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'released') = (released_at is not null))
);

create table if not exists public.fee_schedules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  model jsonb not null check (jsonb_typeof(model) = 'object'),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.wallets');
select public.apply_standard_triggers('public.wallet_holds');
select public.apply_standard_triggers('public.fee_schedules');
select public.rls_enable_default_deny('public.wallets');
select public.rls_enable_default_deny('public.wallet_postings');
select public.rls_enable_default_deny('public.ledger_entries');
select public.rls_enable_default_deny('public.wallet_holds');
select public.rls_enable_default_deny('public.fee_schedules');
select public.audit_enable_for('public.wallets');
select public.audit_enable_for('public.wallet_holds');
select public.audit_enable_for('public.fee_schedules');

drop trigger if exists trg_wallet_postings_append on public.wallet_postings;
create trigger trg_wallet_postings_append before update or delete on public.wallet_postings for each row execute function public.kd_invoice_append_only();
drop trigger if exists trg_ledger_entries_append on public.ledger_entries;
create trigger trg_ledger_entries_append before update or delete on public.ledger_entries for each row execute function public.kd_invoice_append_only();

create unique index if not exists uq_wallets_company on public.wallets (company_id) where deleted_at is null;
create unique index if not exists uq_wallet_postings_key on public.wallet_postings (company_id, idempotency_key);
create index if not exists ix_wallet_postings_ref on public.wallet_postings (company_id, reference_type, reference_id);
create index if not exists ix_ledger_entries_posting on public.ledger_entries (posting_id);
create index if not exists ix_ledger_entries_wallet on public.ledger_entries (wallet_id, created_at desc) where wallet_id is not null;
create index if not exists ix_ledger_entries_company on public.ledger_entries (company_id, created_at desc);
create index if not exists ix_wallet_holds_due on public.wallet_holds (release_at) where status = 'active' and deleted_at is null;
create index if not exists ix_wallet_holds_wallet on public.wallet_holds (wallet_id, status) where deleted_at is null;
create unique index if not exists uq_fee_schedules_company on public.fee_schedules (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;

-- The two balances of a wallet change only inside kd_wallet_post (which sets the switch for its own transaction).
create or replace function public.kd_wallet_guard_balance() returns trigger
language plpgsql
as $$
begin
  if (new.available_balance is distinct from old.available_balance or new.held_balance is distinct from old.held_balance)
     and coalesce(current_setting('kd.wallet_post', true), 'off') <> 'on' then
    raise exception 'wallet balances change only through postings' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists trg_wallets_balance_guard on public.wallets;
create trigger trg_wallets_balance_guard before update on public.wallets for each row execute function public.kd_wallet_guard_balance();

-- The legs of a posting add up to zero. Checked when the transaction ends, so all legs can be inserted first.
create or replace function public.kd_ledger_balanced() returns trigger
language plpgsql
as $$
declare total numeric;
begin
  select coalesce(sum(amount), 0) into total from public.ledger_entries where posting_id = new.posting_id;
  if total <> 0 then
    raise exception 'the legs of posting % add up to %, not zero', new.posting_id, total using errcode = '23514';
  end if;
  return null;
end
$$;
drop trigger if exists trg_ledger_balanced on public.ledger_entries;
create constraint trigger trg_ledger_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function public.kd_ledger_balanced();

-- One money movement. p_legs: [{ "wallet_id": uuid or null, "account": text, "amount": "12.3400", "floor": true }, ...].
-- A leg that takes money out of a wallet is refused when it would leave the available balance below zero, unless the leg
-- says "floor": false (a chargeback may). The same key with the same request returns the first result; the same key with
-- another request is refused. Errors: 22023 bad request, P0002 wallet not found, 55000 wallet not active, 23514 not
-- enough money, 23505 key reused for another request.
create or replace function public.kd_wallet_post(
  p_company uuid, p_key text, p_reason text, p_ref_type text, p_ref_id uuid, p_legs jsonb, p_actor uuid, p_hold jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_posting uuid;
  v_old public.wallet_postings;
  v_leg jsonb;
  v_sum numeric := 0;
  v_amount numeric;
  v_account text;
  v_wallet uuid;
  v_ids uuid[];
  v_id uuid;
  v_w public.wallets;
  v_da numeric;
  v_dh numeric;
  v_check boolean;
  v_hold uuid;
  v_out jsonb := '[]'::jsonb;
begin
  if p_key is null or char_length(p_key) < 8 or p_legs is null or jsonb_typeof(p_legs) <> 'array'
     or jsonb_array_length(p_legs) < 2 or jsonb_array_length(p_legs) > 12 then
    raise exception 'a posting needs a key and between 2 and 12 legs' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(concat_ws('|', p_company::text, p_key, p_reason, p_ref_type, coalesce(p_ref_id::text, ''), p_legs::text, coalesce(p_hold::text, '')), 'UTF8')), 'hex');
  -- Two sessions with the same key take turns, so the second one sees the first one's posting and returns a replay.
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || p_key, 0));
  select * into v_old from public.wallet_postings where company_id = p_company and idempotency_key = p_key;
  if found then
    if v_old.request_hash <> v_hash then
      raise exception 'the key was used for another request' using errcode = '23505';
    end if;
    return jsonb_build_object('posting_id', v_old.id, 'replay', true);
  end if;

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    v_account := v_leg->>'account';
    v_amount := (v_leg->>'amount')::numeric;
    v_wallet := nullif(v_leg->>'wallet_id', '')::uuid;
    if v_amount is null or v_amount = 0 or v_account not in ('available', 'held', 'processor_receivable', 'platform_fee_revenue', 'processor_fee_expense', 'payout_in_transit', 'clearing')
       or (v_wallet is not null) <> (v_account in ('available', 'held')) then
      raise exception 'a leg is not valid' using errcode = '22023';
    end if;
    v_sum := v_sum + v_amount;
    if v_wallet is not null and not (v_wallet = any (coalesce(v_ids, '{}'))) then v_ids := array_append(v_ids, v_wallet); end if;
  end loop;
  if v_sum <> 0 then raise exception 'the legs add up to %, not zero', v_sum using errcode = '22023'; end if;

  -- Lock the wallets in id order (no deadlock between two postings), then check they can move.
  if v_ids is not null then
    for v_id in select x from unnest(v_ids) x order by x loop
      select * into v_w from public.wallets where id = v_id and company_id = p_company and deleted_at is null for update;
      if not found then raise exception 'wallet not found' using errcode = 'P0002'; end if;
      if v_w.status <> 'active' then raise exception 'the wallet is not active' using errcode = '55000'; end if;
    end loop;
  end if;

  insert into public.wallet_postings (company_id, idempotency_key, request_hash, reason, reference_type, reference_id, actor_id)
    values (p_company, p_key, v_hash, p_reason, p_ref_type, p_ref_id, p_actor) returning id into v_posting;
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    insert into public.ledger_entries (company_id, posting_id, wallet_id, account_code, amount)
      values (p_company, v_posting, nullif(v_leg->>'wallet_id', '')::uuid, v_leg->>'account', (v_leg->>'amount')::numeric);
  end loop;

  perform set_config('kd.wallet_post', 'on', true);
  if v_ids is not null then
    foreach v_id in array v_ids loop
      select coalesce(sum((l->>'amount')::numeric) filter (where l->>'account' = 'available'), 0),
             coalesce(sum((l->>'amount')::numeric) filter (where l->>'account' = 'held'), 0),
             coalesce(bool_or(coalesce((l->>'floor')::boolean, true)) filter (where l->>'account' = 'available' and (l->>'amount')::numeric < 0), false)
        into v_da, v_dh, v_check
        from jsonb_array_elements(p_legs) l where (l->>'wallet_id')::uuid = v_id;
      update public.wallets set available_balance = available_balance + v_da, held_balance = held_balance + v_dh where id = v_id
        returning * into v_w;
      if v_check and v_w.available_balance < 0 then
        raise exception 'not enough funds in the wallet' using errcode = '23514';
      end if;
      if v_w.held_balance < 0 then raise exception 'the held balance cannot go below zero' using errcode = '23514'; end if;
      v_out := v_out || jsonb_build_object('wallet_id', v_id, 'available', v_w.available_balance, 'held', v_w.held_balance, 'available_change', v_da);
    end loop;
  end if;
  perform set_config('kd.wallet_post', 'off', true);

  if p_hold is not null then
    insert into public.wallet_holds (company_id, wallet_id, posting_id, amount, reason, source, release_at)
      values (p_company, (p_hold->>'wallet_id')::uuid, v_posting, (p_hold->>'amount')::numeric, p_hold->>'reason',
              coalesce(p_hold->>'source', 'manual'), (p_hold->>'release_at')::timestamptz)
      returning id into v_hold;
  end if;
  return jsonb_build_object('posting_id', v_posting, 'replay', false, 'hold_id', v_hold, 'wallets', v_out);
end
$$;

-- Releases a hold: the held money becomes available. Safe to call twice.
create or replace function public.kd_wallet_release_hold(p_company uuid, p_hold uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h public.wallet_holds;
  v_result jsonb;
begin
  select * into v_h from public.wallet_holds where id = p_hold and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'hold not found' using errcode = 'P0002'; end if;
  if v_h.status = 'released' then return jsonb_build_object('released', false, 'replay', true); end if;
  v_result := public.kd_wallet_post(
    p_company, 'release:' || p_hold::text, 'Hold released', 'wallet_hold', p_hold,
    jsonb_build_array(
      jsonb_build_object('wallet_id', v_h.wallet_id, 'account', 'held', 'amount', (-v_h.amount)::text),
      jsonb_build_object('wallet_id', v_h.wallet_id, 'account', 'available', 'amount', v_h.amount::text)
    ), p_actor);
  update public.wallet_holds set status = 'released', released_at = now(), released_by = p_actor where id = p_hold;
  return v_result || jsonb_build_object('released', true);
end
$$;

-- Checks that every wallet balance equals the sum of its ledger legs; returns the wallets that do not.
create or replace function public.kd_wallet_verify() returns table (wallet_id uuid, available_ledger numeric, held_ledger numeric, available_balance numeric, held_balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  select w.id,
         coalesce(sum(e.amount) filter (where e.account_code = 'available'), 0),
         coalesce(sum(e.amount) filter (where e.account_code = 'held'), 0),
         w.available_balance, w.held_balance
  from public.wallets w left join public.ledger_entries e on e.wallet_id = w.id
  group by w.id
  having coalesce(sum(e.amount) filter (where e.account_code = 'available'), 0) <> w.available_balance
      or coalesce(sum(e.amount) filter (where e.account_code = 'held'), 0) <> w.held_balance
$$;

revoke all on public.wallets, public.wallet_postings, public.ledger_entries, public.wallet_holds, public.fee_schedules from authenticated;
grant all on public.wallets, public.wallet_postings, public.ledger_entries, public.wallet_holds, public.fee_schedules to service_role;
revoke execute on function public.kd_wallet_post(uuid, text, text, text, uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.kd_wallet_release_hold(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.kd_wallet_verify() from public, anon, authenticated;
grant execute on function public.kd_wallet_post(uuid, text, text, text, uuid, jsonb, uuid, jsonb) to service_role;
grant execute on function public.kd_wallet_release_hold(uuid, uuid, uuid) to service_role;
grant execute on function public.kd_wallet_verify() to service_role;
