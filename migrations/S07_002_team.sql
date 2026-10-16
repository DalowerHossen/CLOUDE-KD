-- path: migrations/S07_002_team.sql
-- STEP 07.3 Team: invitations of staff by e-mail. Only the hash of the token is stored; a token works once.

create table if not exists public.team_invitations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preset text not null default 'custom' check (preset ~ '^[a-z_]{2,30}$'),
  granted_permissions text[] not null default '{}',
  token_hash text not null check (char_length(token_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  expires_at timestamptz not null,
  invited_by uuid not null,
  accepted_by uuid,
  accepted_at timestamptz,
  send_count integer not null default 1 check (send_count between 1 and 10),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.team_invitations');
select public.rls_enable_default_deny('public.team_invitations');
select public.audit_enable_for('public.team_invitations');

create unique index if not exists uq_team_invitation_hash on public.team_invitations (token_hash);
-- One open invitation per address and company.
create unique index if not exists uq_team_invitation_open on public.team_invitations (company_id, email) where status = 'pending' and deleted_at is null;
create index if not exists ix_team_invitation_company on public.team_invitations (company_id, created_at desc) where deleted_at is null;

revoke all on public.team_invitations from authenticated;
grant all on public.team_invitations to service_role;

-- Looks at an invitation without using it. Answers a row only while it is pending and not expired.
create or replace function public.kd_invitation_peek(p_hash text) returns table (id uuid, company_id uuid, email text, company_name text)
language sql stable security definer
set search_path = public
as $$
  select i.id, i.company_id, i.email, c.name
    from public.team_invitations i join public.companies c on c.id = i.company_id
   where i.token_hash = p_hash and i.status = 'pending' and i.expires_at > now() and i.deleted_at is null and c.status = 'active' and c.deleted_at is null
$$;

-- Uses the invitation once: creates the profile and the staff membership and closes the invitation in one step.
-- Raises 22023 when the token is unknown, used, cancelled or expired.
create or replace function public.kd_invitation_accept(p_hash text, p_user uuid, p_name text) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.team_invitations%rowtype;
begin
  select * into inv from public.team_invitations
   where token_hash = p_hash and status = 'pending' and expires_at > now() and deleted_at is null
   for update;
  if not found then
    raise exception 'invitation is not valid' using errcode = '22023';
  end if;
  insert into public.profiles (company_id, user_id, email, full_name) values (inv.company_id, p_user, inv.email, left(coalesce(p_name, ''), 200));
  insert into public.memberships (company_id, user_id, role, granted_permissions, status, invited_by)
  values (inv.company_id, p_user, 'staff', inv.granted_permissions, 'active', inv.invited_by);
  update public.team_invitations set status = 'accepted', accepted_by = p_user, accepted_at = now() where id = inv.id;
  return inv.company_id;
end
$$;

revoke all on function public.kd_invitation_peek(text), public.kd_invitation_accept(text, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_invitation_peek(text), public.kd_invitation_accept(text, uuid, text) to service_role;
