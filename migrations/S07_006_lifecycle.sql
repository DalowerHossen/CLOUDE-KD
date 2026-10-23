-- path: migrations/S07_006_lifecycle.sql
-- STEP 07.7 Data tools and offboarding: export and backup requests, and the account closure with a grace period.

create table if not exists public.data_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null check (kind in ('export', 'backup', 'closure')),
  status text not null default 'pending' check (status in ('awaiting_approval', 'pending', 'running', 'ready', 'failed', 'cancelled', 'completed')),
  requested_by uuid not null,
  approval_request_id uuid,
  file_id uuid,
  checksum text check (checksum is null or char_length(checksum) = 64),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  row_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(row_counts) = 'object'),
  scheduled_for timestamptz,
  expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text not null default '' check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.data_requests');
select public.rls_enable_default_deny('public.data_requests');
select public.audit_enable_for('public.data_requests');

create index if not exists ix_data_requests_company on public.data_requests (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_data_requests_work on public.data_requests (status, created_at) where deleted_at is null and status in ('pending', 'running', 'awaiting_approval');
-- One closure that is still open per company.
create unique index if not exists uq_data_requests_closure on public.data_requests (company_id) where kind = 'closure' and status = 'pending' and deleted_at is null;
-- One export or backup in progress per company.
create unique index if not exists uq_data_requests_running on public.data_requests (company_id, kind) where kind in ('export', 'backup') and status in ('pending', 'running') and deleted_at is null;

revoke all on public.data_requests from authenticated;
grant all on public.data_requests to service_role;

-- Takes up to p_limit waiting export or backup requests for work; two workers never get the same one.
create or replace function public.kd_data_request_claim(p_limit integer) returns setof public.data_requests
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  update public.data_requests r set status = 'running', started_at = now()
   where r.id in (
     select id from public.data_requests
      where status = 'pending' and kind in ('export', 'backup') and deleted_at is null
      order by created_at
      limit greatest(1, least(p_limit, 10))
      for update skip locked)
  returning r.*;
end
$$;

revoke all on function public.kd_data_request_claim(integer) from public, anon, authenticated;
grant execute on function public.kd_data_request_claim(integer) to service_role;
