-- path: migrations/S09_011_dunning.sql
-- STEP 09.11 Reminders, late fees and write-offs.
-- reminder_settings / reminder_log / reminder_holds: the ladder of reminder e-mails, what was sent (each step once per
--   invoice), and holds (a promise to pay until a date, or a pause).
-- late_fee_settings / late_fees: fee rules and one row per invoice and period (a fee is proposed or applied once).
-- invoice_writeoffs: money that will not be collected; it settles the invoice through credit_applications (source
--   "write_off") so the invoice closes, while reports can still tell a write-off from a payment.

create table if not exists public.reminder_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  enabled boolean not null default false,
  steps jsonb not null default '[-3, 0, 7, 14, 30]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12),
  quiet_start smallint not null default 20 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  business_days_only boolean not null default true,
  cc_owner boolean not null default false,
  message text not null default '' check (char_length(message) <= 1000),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.reminder_log (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  step_key text not null check (char_length(step_key) between 1 and 40),
  offset_days integer,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  detail text not null default '' check (char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.reminder_holds (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  kind text not null check (kind in ('promise', 'pause')),
  until_date date,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kind <> 'promise' or until_date is not null)
);

create table if not exists public.late_fee_settings (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  enabled boolean not null default false,
  kind text not null default 'percent' check (kind in ('percent', 'fixed')),
  value numeric(18,4) not null default 0 check (value >= 0),
  repeat text not null default 'once' check (repeat in ('once', 'monthly')),
  grace_days integer not null default 0 check (grace_days between 0 and 365),
  cap_percent numeric(9,4) check (cap_percent is null or (cap_percent > 0 and cap_percent <= 100)),
  cap_amount numeric(18,4) check (cap_amount is null or cap_amount > 0),
  auto_apply boolean not null default false,
  label text not null default 'Late fee' check (char_length(label) between 1 and 100),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.late_fees (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  period_key text not null check (char_length(period_key) between 1 and 20),
  amount numeric(18,4) not null check (amount > 0),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'waived')),
  debit_note_id uuid references public.invoices (id) on delete restrict,
  waived_reason text not null default '' check (char_length(waived_reason) <= 300),
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.invoice_writeoffs (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  reason text not null check (char_length(reason) between 10 and 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.reminder_settings');
select public.apply_standard_triggers('public.reminder_log');
select public.apply_standard_triggers('public.reminder_holds');
select public.apply_standard_triggers('public.late_fee_settings');
select public.apply_standard_triggers('public.late_fees');
select public.apply_standard_triggers('public.invoice_writeoffs');
select public.rls_enable_default_deny('public.reminder_settings');
select public.rls_enable_default_deny('public.reminder_log');
select public.rls_enable_default_deny('public.reminder_holds');
select public.rls_enable_default_deny('public.late_fee_settings');
select public.rls_enable_default_deny('public.late_fees');
select public.rls_enable_default_deny('public.invoice_writeoffs');
select public.audit_enable_for('public.reminder_settings');
select public.audit_enable_for('public.late_fee_settings');
select public.audit_enable_for('public.late_fees');
select public.audit_enable_for('public.invoice_writeoffs');
revoke all on public.reminder_settings, public.reminder_log, public.reminder_holds, public.late_fee_settings, public.late_fees, public.invoice_writeoffs from authenticated;
grant all on public.reminder_settings, public.reminder_log, public.reminder_holds, public.late_fee_settings, public.late_fees, public.invoice_writeoffs to service_role;

create unique index if not exists uq_reminder_settings_company on public.reminder_settings (company_id) where deleted_at is null;
create unique index if not exists uq_late_fee_settings_company on public.late_fee_settings (company_id) where deleted_at is null;
create unique index if not exists uq_reminder_log_step on public.reminder_log (invoice_id, step_key);
create index if not exists ix_reminder_holds_invoice on public.reminder_holds (invoice_id) where released_at is null and deleted_at is null;
create unique index if not exists uq_late_fee_period on public.late_fees (invoice_id, period_key) where deleted_at is null;
create index if not exists ix_late_fees_company on public.late_fees (company_id, status, created_at desc) where deleted_at is null;
create index if not exists ix_writeoffs_invoice on public.invoice_writeoffs (invoice_id) where deleted_at is null;

-- The reminder log is append only.
drop trigger if exists trg_reminder_log_append on public.reminder_log;
create trigger trg_reminder_log_append before update or delete on public.reminder_log for each row execute function public.kd_invoice_append_only();

-- A write-off is one more way an invoice is settled, next to credits and deposits.
alter table public.credit_applications drop constraint if exists credit_applications_source_type_check;
alter table public.credit_applications add constraint credit_applications_source_type_check check (source_type in ('credit_note', 'deposit', 'write_off'));

-- Writes off part or all of the balance of an open invoice: the record, the settlement and the payment in one transaction.
create or replace function public.kd_invoice_writeoff(p_company uuid, p_invoice uuid, p_amount numeric, p_reason text, p_by uuid)
returns table (writeoff_id uuid, invoice_status text, balance numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  w uuid;
  res record;
begin
  select * into inv from public.invoices where id = p_invoice and company_id = p_company and deleted_at is null for update;
  if not found then raise exception 'invoice not found' using errcode = '22023'; end if;
  if inv.kind not in ('invoice', 'debit_note') then raise exception 'only an invoice can be written off' using errcode = '22023'; end if;
  if inv.status not in ('sent', 'viewed', 'partially_paid', 'overdue', 'disputed') then raise exception 'invoice is not open' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > inv.amount_due - inv.amount_paid then raise exception 'amount is more than the balance' using errcode = '22023'; end if;
  insert into public.invoice_writeoffs (company_id, invoice_id, amount, reason, created_by) values (p_company, p_invoice, p_amount, p_reason, p_by) returning id into w;
  insert into public.credit_applications (company_id, source_type, source_id, invoice_id, amount, created_by) values (p_company, 'write_off', w, p_invoice, p_amount, p_by);
  select * into res from public.kd_invoice_apply_payment(p_invoice, w, p_amount);
  return query select w, res.status, res.balance;
end
$$;

revoke all on function public.kd_invoice_writeoff(uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.kd_invoice_writeoff(uuid, uuid, numeric, text, uuid) to service_role;
