-- path: migrations/S09_006_invoice_snapshots.sql
-- STEP 09.7 Invoice snapshots: the exact PDF of an invoice at the moment it was sent (file id, checksum, the data that
-- was drawn). Append only: a snapshot is never changed or removed, so the document the client received can be proven.

create table if not exists public.invoice_snapshots (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  file_id uuid not null,
  content_hash text not null check (char_length(content_hash) = 64),
  size_bytes integer not null check (size_bytes > 0),
  reason text not null default 'sent' check (reason in ('sent', 'paid', 'voided', 'manual')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.invoice_snapshots');
select public.rls_enable_default_deny('public.invoice_snapshots');
select public.audit_enable_for('public.invoice_snapshots');
revoke all on public.invoice_snapshots from authenticated;
grant all on public.invoice_snapshots to service_role;
create index if not exists ix_invoice_snapshots_invoice on public.invoice_snapshots (invoice_id, created_at desc);
create unique index if not exists uq_invoice_snapshot_reason on public.invoice_snapshots (invoice_id, reason) where reason <> 'manual';

drop trigger if exists trg_invoice_snapshots_append on public.invoice_snapshots;
create trigger trg_invoice_snapshots_append before update or delete on public.invoice_snapshots for each row execute function public.kd_invoice_append_only();
