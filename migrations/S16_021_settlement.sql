-- path: migrations/S16_021_settlement.sql
-- STEP 16.14.a Settlement ledger between a main merchant and its sub-merchants (records only, no movement of money).
--   settlement_terms     versions of the terms (commission, fixed fee, hold days, minimum payout) per sub-merchant or as the company default.
--   settlement_entries   append-only entries: sale, refund, chargeback, adjustment, with the commission and fee worked out and kept.
--   settlement_payouts   payouts that the main merchant made and recorded (can be voided, never deleted).

create table if not exists public.settlement_terms (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid references public.sub_merchants (id) on delete restrict,
  commission_percent numeric(7,4) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  fixed_fee numeric(18,4) not null default 0 check (fixed_fee >= 0),
  hold_days integer not null default 0 check (hold_days between 0 and 180),
  min_payout numeric(18,4) not null default 0 check (min_payout >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.settlement_entries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid not null references public.sub_merchants (id) on delete restrict,
  kind text not null check (kind in ('sale', 'refund', 'chargeback', 'adjustment')),
  gross numeric(18,4) not null check (gross <> 0),
  commission numeric(18,4) not null default 0,
  fixed_fee numeric(18,4) not null default 0 check (fixed_fee >= 0),
  net numeric(18,4) not null,
  external_ref text not null check (char_length(external_ref) between 1 and 100),
  occurred_at timestamptz not null,
  available_at timestamptz not null,
  terms_id uuid references public.settlement_terms (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  -- guard:append-only (settlement ledger; rows are never changed)
  check ((kind = 'sale' and gross > 0) or (kind in ('refund', 'chargeback') and gross < 0) or kind = 'adjustment'),
  check (net = gross - commission - fixed_fee),
  check (kind <> 'adjustment' or (commission = 0 and fixed_fee = 0)),
  check (available_at >= occurred_at)
);

create table if not exists public.settlement_payouts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  sub_merchant_id uuid not null references public.sub_merchants (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  reference text not null check (char_length(reference) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  paid_at timestamptz not null,
  void_reason text not null default '' check (char_length(void_reason) <= 300),
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'void') = (voided_at is not null))
);

select public.apply_standard_triggers('public.settlement_terms');
select public.apply_standard_triggers('public.settlement_payouts');
select public.rls_enable_default_deny('public.settlement_terms');
select public.rls_enable_default_deny('public.settlement_entries');
select public.rls_enable_default_deny('public.settlement_payouts');
select public.audit_enable_for('public.settlement_terms');
select public.audit_enable_for('public.settlement_payouts');

create unique index if not exists uq_settlement_terms on public.settlement_terms (company_id, coalesce(sub_merchant_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from) where deleted_at is null;
create index if not exists ix_settlement_terms_sub on public.settlement_terms (company_id, sub_merchant_id, effective_from desc) where deleted_at is null;
create unique index if not exists uq_settlement_entry on public.settlement_entries (company_id, sub_merchant_id, kind, external_ref);
create index if not exists ix_settlement_entries_sub on public.settlement_entries (sub_merchant_id, occurred_at desc);
create unique index if not exists uq_settlement_payout_key on public.settlement_payouts (company_id, idempotency_key);
create index if not exists ix_settlement_payouts_sub on public.settlement_payouts (sub_merchant_id, paid_at desc) where deleted_at is null;

-- Rows belong to the company of their parents; the ledger never changes; a payout only goes from recorded to void.
create or replace function public.kd_settlement_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid; v_sub uuid; v_terms uuid;
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'the company of a row does not change' using errcode = '55000';
  end if;
  v_sub := nullif(to_jsonb(new) ->> 'sub_merchant_id', '')::uuid;
  v_terms := nullif(to_jsonb(new) ->> 'terms_id', '')::uuid;
  if v_sub is not null then
    select company_id into v_company from public.sub_merchants where id = v_sub;
    if v_company is null or v_company <> new.company_id then raise exception 'the sub-merchant was not found' using errcode = 'P0002'; end if;
  end if;
  if v_terms is not null then
    select company_id into v_company from public.settlement_terms where id = v_terms;
    if v_company is null or v_company <> new.company_id then raise exception 'the terms were not found' using errcode = 'P0002'; end if;
  end if;
  if tg_table_name = 'settlement_payouts' and tg_op = 'UPDATE' then
    if old.status = 'void' or new.amount is distinct from old.amount or new.sub_merchant_id is distinct from old.sub_merchant_id
       or new.idempotency_key is distinct from old.idempotency_key or new.reference is distinct from old.reference then
      raise exception 'a recorded payout changes only by being voided' using errcode = '55000';
    end if;
  end if;
  if tg_table_name = 'settlement_terms' and tg_op = 'UPDATE' then
    if new.commission_percent is distinct from old.commission_percent
       or new.fixed_fee is distinct from old.fixed_fee or new.hold_days is distinct from old.hold_days
       or new.min_payout is distinct from old.min_payout or new.effective_from is distinct from old.effective_from then
      raise exception 'terms are not changed; a new version is made' using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_settlement_terms_guard on public.settlement_terms;
create trigger trg_settlement_terms_guard before insert or update on public.settlement_terms for each row execute function public.kd_settlement_guard();
drop trigger if exists trg_settlement_entries_guard on public.settlement_entries;
create trigger trg_settlement_entries_guard before insert on public.settlement_entries for each row execute function public.kd_settlement_guard();
drop trigger if exists trg_settlement_payouts_guard on public.settlement_payouts;
create trigger trg_settlement_payouts_guard before insert or update on public.settlement_payouts for each row execute function public.kd_settlement_guard();

create or replace function public.kd_settlement_entries_append() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('kd.allow_hard_delete', true) = 'on' and tg_op = 'DELETE' then return old; end if;
  raise exception 'the settlement ledger is append-only' using errcode = '55000';
end
$$;
drop trigger if exists trg_settlement_entries_append on public.settlement_entries;
create trigger trg_settlement_entries_append before update or delete on public.settlement_entries for each row execute function public.kd_settlement_entries_append();

-- The balance of one sub-merchant as text (exact): all entries, the part still on hold, the recorded payouts, and what can be paid now.
create or replace function public.kd_settlement_balance(p_company uuid, p_sub uuid, p_now timestamptz)
returns table (total_net text, pending text, paid text, available text)
language sql
stable
set search_path = public
as $$
  with e as (
    select coalesce(sum(net), 0) as total,
           coalesce(sum(net) filter (where net > 0 and available_at > p_now), 0) as pending
    from public.settlement_entries where company_id = p_company and sub_merchant_id = p_sub
  ), p as (
    select coalesce(sum(amount), 0) as paid
    from public.settlement_payouts where company_id = p_company and sub_merchant_id = p_sub and status = 'recorded' and deleted_at is null
  )
  select e.total::text, e.pending::text, p.paid::text, (e.total - e.pending - p.paid)::text from e, p
$$;

-- Records a payout. One at a time per sub-merchant (a lock), never more than the available balance and never less than the minimum,
-- and the same idempotency key gives the same payout again.
create or replace function public.kd_settlement_record_payout(
  p_company uuid, p_sub uuid, p_amount numeric, p_reference text, p_key text, p_paid_at timestamptz, p_by uuid, p_min numeric
) returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid; v_avail numeric; v_old record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_sub::text, 16));
  select id, amount, sub_merchant_id into v_old from public.settlement_payouts where company_id = p_company and idempotency_key = p_key;
  if found then
    if v_old.amount <> p_amount or v_old.sub_merchant_id <> p_sub then raise exception 'this key was used for another payout' using errcode = '55000'; end if;
    return v_old.id;
  end if;
  if p_amount < p_min then raise exception 'the amount is below the minimum payout' using errcode = '22023'; end if;
  select b.available::numeric into v_avail from public.kd_settlement_balance(p_company, p_sub, now()) b;
  if p_amount > v_avail then raise exception 'the amount is more than the available balance' using errcode = '22023'; end if;
  insert into public.settlement_payouts (company_id, sub_merchant_id, amount, reference, idempotency_key, paid_at, created_by)
    values (p_company, p_sub, p_amount, p_reference, p_key, p_paid_at, p_by) returning id into v_id;
  return v_id;
end
$$;

-- Entries of a sub-merchant, newest first, with every amount as text.
create or replace function public.kd_settlement_entries_text(p_company uuid, p_sub uuid, p_limit integer, p_before timestamptz)
returns table (id uuid, kind text, gross text, commission text, fixed_fee text, net text, external_ref text, occurred_at timestamptz, available_at timestamptz, note text)
language sql
stable
set search_path = public
as $$
  select e.id, e.kind, e.gross::text, e.commission::text, e.fixed_fee::text, e.net::text, e.external_ref, e.occurred_at, e.available_at, e.note
  from public.settlement_entries e
  where e.company_id = p_company and e.sub_merchant_id = p_sub and (p_before is null or e.occurred_at < p_before)
  order by e.occurred_at desc, e.id desc
  limit greatest(1, least(p_limit, 500))
$$;

revoke all on public.settlement_terms, public.settlement_entries, public.settlement_payouts from authenticated;
grant all on public.settlement_terms, public.settlement_entries, public.settlement_payouts to service_role;
revoke all on function public.kd_settlement_guard(), public.kd_settlement_entries_append(), public.kd_settlement_balance(uuid, uuid, timestamptz),
  public.kd_settlement_record_payout(uuid, uuid, numeric, text, text, timestamptz, uuid, numeric),
  public.kd_settlement_entries_text(uuid, uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.kd_settlement_guard(), public.kd_settlement_entries_append(), public.kd_settlement_balance(uuid, uuid, timestamptz),
  public.kd_settlement_record_payout(uuid, uuid, numeric, text, text, timestamptz, uuid, numeric),
  public.kd_settlement_entries_text(uuid, uuid, integer, timestamptz) to service_role;
