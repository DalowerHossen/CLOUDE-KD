-- path: migrations/S09_003_numbering.sql
-- STEP 09.4 Gap-free document numbers. A number is taken inside the same transaction that writes it on the document,
-- under an advisory lock per company and series, so a failed save never leaves a hole and two requests never share a
-- number. Voided documents keep their number (numbers are never reused).

create table if not exists public.invoice_sequences (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  series text not null check (series ~ '^[A-Z]{2,5}$'),
  year integer not null check (year = 0 or year between 2000 and 9999),
  last_value bigint not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
select public.apply_standard_triggers('public.invoice_sequences');
select public.rls_enable_default_deny('public.invoice_sequences');
select public.audit_enable_for('public.invoice_sequences');
revoke all on public.invoice_sequences from authenticated;
grant all on public.invoice_sequences to service_role;
create unique index if not exists uq_invoice_sequence on public.invoice_sequences (company_id, series, year) where deleted_at is null;

-- The next value of a series. p_year is 0 for a series that never resets. The first value of a series is p_start when the
-- company has no counter for that series yet (so a company can start at 1000); a new year of a yearly series starts at 1.
create or replace function public.kd_next_doc_number(p_company uuid, p_series text, p_year integer, p_start bigint) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  n bigint;
  any_before boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || p_series, 0));
  select exists (select 1 from public.invoice_sequences where company_id = p_company and series = p_series and deleted_at is null) into any_before;
  insert into public.invoice_sequences (company_id, series, year, last_value)
  values (p_company, p_series, p_year, case when any_before then 1 else greatest(p_start, 1) end)
  on conflict (company_id, series, year) where deleted_at is null
  do update set last_value = public.invoice_sequences.last_value + 1
  returning last_value into n;
  return n;
end
$$;

-- Gives a draft or waiting invoice its number. p_manual: a number typed by the owner (it uses no counter value).
create or replace function public.kd_invoice_assign_number(p_company uuid, p_invoice uuid, p_prefix text, p_yearly boolean, p_padding integer, p_start bigint, p_year integer, p_manual text) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  series text;
  n bigint;
  result text;
begin
  select * into inv from public.invoices where id = p_invoice and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if inv.number is not null then raise exception 'invoice already has a number' using errcode = '22023'; end if;
  if inv.status not in ('draft', 'pending_approval') then raise exception 'invoice cannot be numbered in this state' using errcode = '22023'; end if;
  if p_manual is not null then
    if inv.status <> 'draft' then raise exception 'a number can be typed only on a draft' using errcode = '22023'; end if;
    result := p_manual;
  else
    series := case inv.kind when 'invoice' then 'INV' when 'proforma' then 'PI' when 'deposit' then 'DEP' else 'DN' end;
    n := public.kd_next_doc_number(p_company, series, case when p_yearly then p_year else 0 end, p_start);
    result := p_prefix || case when p_yearly then p_year::text || '-' else '' end || lpad(n::text, greatest(p_padding, 1), '0');
  end if;
  update public.invoices set number = result where id = p_invoice;
  return result;
end
$$;

-- The value the next number of a series will have, without taking it (for the settings preview).
create or replace function public.kd_peek_doc_number(p_company uuid, p_series text, p_year integer, p_start bigint) returns bigint
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.invoice_sequences where company_id = p_company and series = p_series and year = p_year and deleted_at is null)
      then (select last_value + 1 from public.invoice_sequences where company_id = p_company and series = p_series and year = p_year and deleted_at is null)
    when exists (select 1 from public.invoice_sequences where company_id = p_company and series = p_series and deleted_at is null) then 1
    else greatest(p_start, 1)
  end
$$;

revoke all on function public.kd_next_doc_number(uuid, text, integer, bigint), public.kd_invoice_assign_number(uuid, uuid, text, boolean, integer, bigint, integer, text), public.kd_peek_doc_number(uuid, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.kd_next_doc_number(uuid, text, integer, bigint), public.kd_invoice_assign_number(uuid, uuid, text, boolean, integer, bigint, integer, text), public.kd_peek_doc_number(uuid, text, integer, bigint) to service_role;
