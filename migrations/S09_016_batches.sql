-- path: migrations/S09_016_batches.sql
-- STEP 09.16 Batches. A batch is many invoices (or clients) and one action: send, remind, delete drafts, void, tag, or
-- create from a template. The work is cut into items; a job takes items in small groups (skip locked, so two workers never
-- take the same item), records the result of each, and keeps the counters of the batch. An invoice can be in only one
-- waiting item for the same action, so two batches can never send the same invoice twice.

create table if not exists public.invoice_batches (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  action text not null check (action in ('send', 'remind', 'trash', 'void', 'tag', 'create')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'cancelled')),
  item_count integer not null check (item_count >= 0),
  done_count integer not null default 0 check (done_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  options jsonb not null default '{}' check (jsonb_typeof(options) = 'object'),
  run_after timestamptz not null default now(),
  created_by uuid not null,
  created_role text not null check (created_role in ('owner', 'staff')),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (done_count + failed_count + skipped_count <= item_count)
);

create table if not exists public.invoice_batch_items (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  batch_id uuid not null references public.invoice_batches (id) on delete restrict,
  action text not null,
  invoice_id uuid references public.invoices (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  message text not null default '' check (char_length(message) <= 300),
  result_invoice_id uuid references public.invoices (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (invoice_id is not null or client_id is not null)
);

select public.apply_standard_triggers('public.invoice_batches');
select public.apply_standard_triggers('public.invoice_batch_items');
select public.rls_enable_default_deny('public.invoice_batches');
select public.rls_enable_default_deny('public.invoice_batch_items');
select public.audit_enable_for('public.invoice_batches');
revoke all on public.invoice_batches, public.invoice_batch_items from authenticated;
grant all on public.invoice_batches, public.invoice_batch_items to service_role;

create index if not exists ix_batches_company on public.invoice_batches (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_batches_open on public.invoice_batches (run_after) where status in ('queued', 'running') and deleted_at is null;
create index if not exists ix_batch_items_batch on public.invoice_batch_items (batch_id, status);
create unique index if not exists uq_batch_item_active on public.invoice_batch_items (invoice_id, action) where invoice_id is not null and status in ('pending', 'running') and deleted_at is null;
create unique index if not exists uq_batch_item_client on public.invoice_batch_items (batch_id, client_id) where client_id is not null and deleted_at is null;

-- Takes up to p_limit waiting items of batches that are due. Items stuck "running" for more than 10 minutes (a crashed
-- worker) are put back first. The batch becomes "running".
create or replace function public.kd_batch_claim(p_limit integer)
returns table (item_id uuid, batch_id uuid, company_id uuid, action text, invoice_id uuid, client_id uuid, attempts integer, options jsonb, created_by uuid, created_role text)
language plpgsql security definer
set search_path = public
as $$
begin
  update public.invoice_batch_items i set status = 'pending'
   where i.status = 'running' and i.updated_at < now() - interval '10 minutes' and i.deleted_at is null;
  return query
  with due as (
    select i.id from public.invoice_batch_items i
      join public.invoice_batches b on b.id = i.batch_id
     where i.status = 'pending' and i.deleted_at is null and b.status in ('queued', 'running') and b.run_after <= now() and b.deleted_at is null
     order by b.run_after, i.created_at
     limit least(greatest(p_limit, 1), 100)
     for update of i skip locked
  ), taken as (
    update public.invoice_batch_items i set status = 'running', attempts = i.attempts + 1
      from due where i.id = due.id
    returning i.id, i.batch_id, i.company_id, i.action, i.invoice_id, i.client_id, i.attempts
  ), mark as (
    update public.invoice_batches b set status = 'running' where b.id in (select t.batch_id from taken t) and b.status = 'queued' returning b.id
  )
  select t.id, t.batch_id, t.company_id, t.action, t.invoice_id, t.client_id, t.attempts, b.options, b.created_by, b.created_role
    from taken t join public.invoice_batches b on b.id = t.batch_id;
end
$$;

-- Records the result of one item and keeps the counters; the batch is done when nothing is waiting or running.
create or replace function public.kd_batch_item_result(p_item uuid, p_status text, p_message text, p_result_invoice uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare it public.invoice_batch_items%rowtype; open_items integer;
begin
  if p_status not in ('pending', 'done', 'failed', 'skipped') then raise exception 'unknown status' using errcode = '22023'; end if;
  select * into it from public.invoice_batch_items where id = p_item for update;
  if not found or it.status <> 'running' then return; end if;
  update public.invoice_batch_items set status = p_status, message = left(coalesce(p_message, ''), 300), result_invoice_id = p_result_invoice where id = p_item;
  if p_status <> 'pending' then
    update public.invoice_batches set
      done_count = done_count + case when p_status = 'done' then 1 else 0 end,
      failed_count = failed_count + case when p_status = 'failed' then 1 else 0 end,
      skipped_count = skipped_count + case when p_status = 'skipped' then 1 else 0 end
     where id = it.batch_id;
  end if;
  select count(*) into open_items from public.invoice_batch_items where batch_id = it.batch_id and status in ('pending', 'running') and deleted_at is null;
  if open_items = 0 then
    update public.invoice_batches set status = 'done', finished_at = now() where id = it.batch_id and status in ('queued', 'running');
  end if;
end
$$;

-- Cancels the waiting items of a batch; items already done stay done.
create or replace function public.kd_batch_cancel(p_company uuid, p_batch uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.invoice_batch_items set status = 'skipped', message = 'Cancelled'
   where batch_id = p_batch and company_id = p_company and status = 'pending';
  get diagnostics n = row_count;
  update public.invoice_batches set skipped_count = skipped_count + n, status = case when exists (select 1 from public.invoice_batch_items where batch_id = p_batch and status = 'running') then status else 'cancelled' end,
    finished_at = case when exists (select 1 from public.invoice_batch_items where batch_id = p_batch and status = 'running') then finished_at else now() end
   where id = p_batch and company_id = p_company and status in ('queued', 'running');
  return n;
end
$$;

-- Puts the failed items of a finished batch back in line (each at most three attempts in all).
create or replace function public.kd_batch_retry(p_company uuid, p_batch uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  update public.invoice_batch_items set status = 'pending', attempts = 0, message = ''
   where batch_id = p_batch and company_id = p_company and status = 'failed';
  get diagnostics n = row_count;
  if n > 0 then
    update public.invoice_batches set failed_count = greatest(failed_count - n, 0), status = 'queued', finished_at = null
     where id = p_batch and company_id = p_company;
  end if;
  return n;
end
$$;

revoke all on function public.kd_batch_claim(integer), public.kd_batch_item_result(uuid, text, text, uuid), public.kd_batch_cancel(uuid, uuid), public.kd_batch_retry(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kd_batch_claim(integer), public.kd_batch_item_result(uuid, text, text, uuid), public.kd_batch_cancel(uuid, uuid), public.kd_batch_retry(uuid, uuid) to service_role;
