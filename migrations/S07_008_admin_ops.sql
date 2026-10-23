-- path: migrations/S07_008_admin_ops.sql
-- STEP 07.9 Admin operations: weekly shifts of admin staff, platform announcements, setup wizard progress.

create table if not exists public.admin_shifts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (end_minute > start_minute)
);

create table if not exists public.announcements (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'info' check (kind in ('info', 'maintenance', 'warning')),
  audience text not null default 'all' check (audience in ('all', 'owners')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'published' check (status in ('published', 'withdrawn')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (ends_at > starts_at)
);

create table if not exists public.platform_setup (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  step_key text not null check (step_key in ('approval_mode', 'email', 'security')),
  choice text not null default '' check (char_length(choice) <= 100),
  completed_by uuid not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.admin_shifts');
select public.apply_standard_triggers('public.announcements');
select public.apply_standard_triggers('public.platform_setup');
select public.rls_enable_default_deny('public.admin_shifts');
select public.rls_enable_default_deny('public.announcements');
select public.rls_enable_default_deny('public.platform_setup');
select public.audit_enable_for('public.admin_shifts');
select public.audit_enable_for('public.announcements');
select public.audit_enable_for('public.platform_setup');

create unique index if not exists uq_admin_shift_slot on public.admin_shifts (user_id, weekday, start_minute) where deleted_at is null;
create index if not exists ix_admin_shift_day on public.admin_shifts (weekday, start_minute) where deleted_at is null;
create index if not exists ix_announcements_live on public.announcements (ends_at) where deleted_at is null and status = 'published';
create unique index if not exists uq_platform_setup_step on public.platform_setup (step_key) where deleted_at is null;

-- Replaces the whole weekly plan of one person in one step. p_rows: [{weekday, start, end}, ...] (minutes of the day).
-- Raises 22023 when two slots of the person overlap.
create or replace function public.kd_admin_shifts_replace(p_user uuid, p_rows jsonb) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r jsonb;
  n integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 42 then
    raise exception 'shift list is not valid' using errcode = '22023';
  end if;
  update public.admin_shifts set deleted_at = now() where user_id = p_user and deleted_at is null;
  for r in select * from jsonb_array_elements(p_rows) loop
    if exists (
      select 1 from public.admin_shifts s
       where s.user_id = p_user and s.deleted_at is null and s.weekday = (r ->> 'weekday')::smallint
         and s.start_minute < (r ->> 'end')::smallint and s.end_minute > (r ->> 'start')::smallint
    ) then
      raise exception 'shifts overlap' using errcode = '22023';
    end if;
    insert into public.admin_shifts (user_id, weekday, start_minute, end_minute)
    values (p_user, (r ->> 'weekday')::smallint, (r ->> 'start')::smallint, (r ->> 'end')::smallint);
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public.kd_admin_shifts_replace(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kd_admin_shifts_replace(uuid, jsonb) to service_role;

revoke all on public.admin_shifts, public.announcements, public.platform_setup from authenticated;
grant all on public.admin_shifts, public.announcements, public.platform_setup to service_role;
