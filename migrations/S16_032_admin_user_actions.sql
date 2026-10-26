-- path: migrations/S16_032_admin_user_actions.sql
-- STEP 16 Platform actions on a person: delete with a 30 day grace, permanent removal after the grace, forced password reset,
-- two-step sign-in reset, e-mail change and plan change. The action list of admin_actions is widened and a request can carry
-- the values it needs (the new e-mail, the plan). A deletion is kept in its own table so the grace period has a date.

alter table public.admin_actions drop constraint if exists admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('user.suspend', 'user.reactivate', 'tenant.suspend', 'tenant.reactivate',
    'user.soft_delete', 'user.purge', 'user.force_password_reset', 'user.reset_2fa', 'user.change_email', 'user.set_plan'));
alter table public.admin_actions add column if not exists params jsonb not null default '{}'::jsonb
  check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 1024);

create table if not exists public.user_deletions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  requested_by uuid not null,
  reason text not null check (char_length(reason) between 10 and 1000),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'purged')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'scheduled') = (closed_at is null))
);
create unique index if not exists uq_user_deletions_open on public.user_deletions (user_id) where status = 'scheduled' and deleted_at is null;
create index if not exists ix_user_deletions_due on public.user_deletions (scheduled_for) where status = 'scheduled' and deleted_at is null;
select public.apply_standard_triggers('public.user_deletions');
select public.rls_enable_default_deny('public.user_deletions');
select public.audit_enable_for('public.user_deletions');
revoke all on public.user_deletions from authenticated;
grant all on public.user_deletions to service_role;

-- Permanent removal: personal data of the profile is replaced by a tombstone and the person can no longer sign in. The row
-- itself stays (invoices, payments and the audit chain point to its id). Allowed only after the grace period of a
-- scheduled deletion. Returns the SHA-256 certificate.
create or replace function public.kd_user_purge(p_user uuid, p_actor uuid) returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  del public.user_deletions;
  cert text;
begin
  select * into del from public.user_deletions where user_id = p_user and status = 'scheduled' and deleted_at is null for update;
  if not found then
    raise exception 'no scheduled deletion' using errcode = '02000';
  end if;
  if del.scheduled_for > now() then
    raise exception 'grace period is not over' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join public.companies c on c.id = m.company_id
    where m.user_id = p_user and m.role = 'owner' and m.deleted_at is null and c.deleted_at is null and c.status <> 'closed'
  ) then
    raise exception 'owner of a company that is not closed' using errcode = '23514';
  end if;
  update public.profiles set email = 'erased+' || id::text || '@invalid.example', full_name = '', status = 'disabled' where user_id = p_user;
  update public.memberships set status = 'suspended', granted_permissions = '{}' where user_id = p_user;
  update public.user_deletions set status = 'purged', closed_at = now() where id = del.id;
  cert := encode(extensions.digest('kd-user-purge-v1|' || del.id::text || '|' || p_user::text || '|' || p_actor::text || '|' || now()::text, 'sha256'), 'hex');
  return cert;
end
$$;
revoke execute on function public.kd_user_purge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kd_user_purge(uuid, uuid) to service_role;
