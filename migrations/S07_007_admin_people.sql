-- path: migrations/S07_007_admin_people.sql
-- STEP 07.8 Admin people: platform actions on users and tenants (with their approval), and internal notes.

create table if not exists public.admin_actions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  action text not null check (action in ('user.suspend', 'user.reactivate', 'tenant.suspend', 'tenant.reactivate')),
  subject_type text not null check (subject_type in ('user', 'tenant')),
  subject_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 1000),
  requested_by uuid not null,
  approval_request_id uuid,
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval', 'applied', 'rejected', 'failed')),
  result text not null default '' check (char_length(result) <= 300),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.admin_notes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  subject_type text not null check (subject_type in ('user', 'tenant')),
  subject_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.admin_actions');
select public.apply_standard_triggers('public.admin_notes');
select public.rls_enable_default_deny('public.admin_actions');
select public.rls_enable_default_deny('public.admin_notes');
select public.audit_enable_for('public.admin_actions');
select public.audit_enable_for('public.admin_notes');

-- One open action per subject.
create unique index if not exists uq_admin_action_open on public.admin_actions (subject_type, subject_id) where status = 'awaiting_approval' and deleted_at is null;
create index if not exists ix_admin_action_wait on public.admin_actions (status, created_at) where deleted_at is null and status = 'awaiting_approval';
create index if not exists ix_admin_notes_subject on public.admin_notes (subject_type, subject_id, created_at desc) where deleted_at is null;

revoke all on public.admin_actions, public.admin_notes from authenticated;
grant all on public.admin_actions, public.admin_notes to service_role;
