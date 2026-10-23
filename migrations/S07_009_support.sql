-- path: migrations/S07_009_support.sql
-- STEP 07.10 Support tickets: tickets of a company, the message thread, and the SLA clocks.

create sequence if not exists public.support_ticket_seq;

create table if not exists public.support_tickets (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  number text not null default ('T-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  subject text not null check (char_length(subject) between 3 and 200),
  category text not null default 'question' check (category in ('question', 'billing', 'payments', 'technical', 'account', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  requester_id uuid not null,
  assignee_id uuid,
  first_response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  sla_alerted_at timestamptz,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.support_messages (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  ticket_id uuid not null references public.support_tickets (id) on delete restrict,
  author_id uuid,
  author_kind text not null check (author_kind in ('customer', 'agent', 'system')),
  internal boolean not null default false,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (not internal or author_kind = 'agent')
);

select public.apply_standard_triggers('public.support_tickets');
select public.apply_standard_triggers('public.support_messages');
select public.rls_enable_default_deny('public.support_tickets');
select public.rls_enable_default_deny('public.support_messages');
select public.audit_enable_for('public.support_tickets');
select public.audit_enable_for('public.support_messages');

create unique index if not exists uq_support_ticket_number on public.support_tickets (number);
create index if not exists ix_support_ticket_company on public.support_tickets (company_id, last_activity_at desc) where deleted_at is null;
create index if not exists ix_support_ticket_queue on public.support_tickets (status, priority, first_response_due_at) where deleted_at is null and status in ('open', 'pending');
create index if not exists ix_support_ticket_assignee on public.support_tickets (assignee_id, status) where deleted_at is null;
create index if not exists ix_support_message_ticket on public.support_messages (ticket_id, created_at) where deleted_at is null;

-- Policies: a company reads only its own tickets and the non-internal messages; writes go through the server.
revoke all on public.support_tickets, public.support_messages from authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;
grant usage, select on sequence public.support_ticket_seq to service_role;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (deleted_at is null and (company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select to authenticated
  using (deleted_at is null and ((company_id = (select public.app_company_id()) and not internal) or (select public.app_is_platform())));
