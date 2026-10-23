-- path: migrations/S13_004_branding.sql
-- STEP 13.5 Client-facing branding that the company settings (STEP 07) do not hold: a secondary colour, the e-mail
-- signature and a footer line for client pages and messages. Colour, accent, font and logo stay in the `branding` settings
-- section. Every change is also written to an append-only history (what it was, what it became, who did it).

create table if not exists public.tenant_branding (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  secondary_color text not null default '#334155' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  email_signature text not null default '' check (char_length(email_signature) <= 2000),
  client_footer text not null default '' check (char_length(client_footer) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.tenant_branding');
select public.rls_enable_default_deny('public.tenant_branding');
select public.audit_enable_for('public.tenant_branding');
create unique index if not exists uq_tenant_branding_company on public.tenant_branding (company_id) where deleted_at is null;

create table if not exists public.branding_history (
  -- guard:append-only (branding change log; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  action text not null check (action in ('save', 'reset', 'import')),
  changed_by uuid,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_branding_history_company on public.branding_history (company_id, created_at desc);
drop trigger if exists trg_branding_history_append on public.branding_history;
create trigger trg_branding_history_append before update or delete on public.branding_history for each row execute function public.kd_invoice_append_only();
select public.rls_enable_default_deny('public.branding_history');

revoke all on public.tenant_branding from authenticated;
grant all on public.tenant_branding to service_role;
