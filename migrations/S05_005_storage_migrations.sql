-- path: migrations/S05_005_storage_migrations.sql
-- STEP 05.6 Provider migrations: one job per request, one item per file, claimed in small batches (resumable).

create table if not exists public.storage_migrations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  target_provider text not null check (target_provider in ('google_drive', 'supabase')),
  delete_source boolean not null default false,
  status text not null default 'running' check (status in ('running', 'paused', 'done', 'cancelled')),
  item_count integer not null default 0 check (item_count >= 0),
  done_count integer not null default 0 check (done_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  requested_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.storage_migration_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  migration_id uuid not null references public.storage_migrations (id) on delete restrict,
  file_id uuid not null references public.files (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'working', 'done', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.storage_migrations');
select public.apply_standard_triggers('public.storage_migration_items');
select public.rls_enable_default_deny('public.storage_migrations');
select public.rls_enable_default_deny('public.storage_migration_items');
select public.audit_enable_for('public.storage_migrations');

create unique index if not exists uq_migration_item on public.storage_migration_items (migration_id, file_id);
create index if not exists ix_migration_items_pending on public.storage_migration_items (migration_id, status);
create index if not exists ix_migrations_company on public.storage_migrations (company_id, created_at desc) where deleted_at is null;
-- One running migration per company at a time.
create unique index if not exists uq_migration_running on public.storage_migrations (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null and status in ('running', 'paused');

revoke all on public.storage_migrations, public.storage_migration_items from authenticated;
grant all on public.storage_migrations, public.storage_migration_items to service_role;

-- Adds every live file of the company that is not on the target provider. Returns how many items were created.
create or replace function public.kd_migration_enqueue_all(p_migration uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  m public.storage_migrations%rowtype;
  n integer;
begin
  select * into m from public.storage_migrations where id = p_migration and deleted_at is null for update;
  if not found then raise exception 'migration not found' using errcode = 'P0002'; end if;
  insert into public.storage_migration_items (company_id, migration_id, file_id)
  select f.company_id, m.id, f.id from public.files f
  where f.deleted_at is null and f.company_id is not distinct from m.company_id and f.storage_provider <> m.target_provider
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.storage_migrations set item_count = (select count(*) from public.storage_migration_items where migration_id = m.id) where id = m.id;
  -- Nothing to move and nothing open: the migration is finished at once.
  if not exists (select 1 from public.storage_migration_items where migration_id = m.id and status in ('pending', 'working')) then
    update public.storage_migrations set status = 'done', finished_at = now() where id = m.id;
  end if;
  return n;
end
$$;

-- Hands out up to p_limit pending items of running migrations (an item stuck in "working" for 10 minutes is handed out again).
create or replace function public.kd_migration_claim(p_limit integer) returns table (item_id uuid, migration_id uuid, file_id uuid, target_provider text, delete_source boolean, attempts integer)
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select i.id from public.storage_migration_items i
    join public.storage_migrations m on m.id = i.migration_id and m.status = 'running' and m.deleted_at is null
    where i.deleted_at is null and i.attempts < 4
      and (i.status = 'pending' or (i.status = 'working' and i.updated_at < now() - interval '10 minutes'))
    order by i.created_at
    limit greatest(1, least(p_limit, 50))
    for update of i skip locked
  ), upd as (
    update public.storage_migration_items i set status = 'working', attempts = i.attempts + 1
    from picked where i.id = picked.id
    returning i.id, i.migration_id, i.file_id, i.attempts
  )
  select upd.id, upd.migration_id, upd.file_id, m.target_provider, m.delete_source, upd.attempts
  from upd join public.storage_migrations m on m.id = upd.migration_id;
end
$$;

-- Records the result of one item, updates the counters and closes the migration when nothing is left.
create or replace function public.kd_migration_item_result(p_item uuid, p_status text, p_error text) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.storage_migration_items%rowtype;
  open_count integer;
begin
  if p_status not in ('done', 'failed', 'skipped', 'pending') then raise exception 'bad status' using errcode = '22023'; end if;
  select * into i from public.storage_migration_items where id = p_item and deleted_at is null for update;
  if not found then return; end if;
  -- A failed item is tried again (pending) until its attempts are used up.
  update public.storage_migration_items set status = case when p_status = 'failed' and attempts < 4 then 'pending' else p_status end, error = left(p_error, 300) where id = p_item;
  update public.storage_migrations m set
    done_count = (select count(*) from public.storage_migration_items where migration_id = m.id and status = 'done'),
    failed_count = (select count(*) from public.storage_migration_items where migration_id = m.id and status = 'failed'),
    skipped_count = (select count(*) from public.storage_migration_items where migration_id = m.id and status = 'skipped'),
    last_error = coalesce(left(p_error, 300), last_error)
  where m.id = i.migration_id;
  select count(*) into open_count from public.storage_migration_items where migration_id = i.migration_id and (status in ('pending', 'working'));
  if open_count = 0 then
    update public.storage_migrations set status = 'done', finished_at = now() where id = i.migration_id and status = 'running';
  end if;
end
$$;

revoke all on function public.kd_migration_enqueue_all(uuid), public.kd_migration_claim(integer), public.kd_migration_item_result(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kd_migration_enqueue_all(uuid), public.kd_migration_claim(integer), public.kd_migration_item_result(uuid, text, text) to service_role;
