-- path: migrations/S02_005_approvals.sql
-- STEP 02.7a Approval engine: rules, requests, steps, delegations and the transactional decision functions.
-- Levels: L0 none, L1 owner (or higher), L2 CEO (or super_admin), L3 super_admin, L2+L3 both by different people.

create table if not exists public.approval_rules (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  level text not null check (level in ('L0', 'L1', 'L2', 'L3', 'L2+L3')),
  sla_hours integer not null default 24 check (sla_hours between 1 and 720),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.approval_requests (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  payload jsonb not null default '{}'::jsonb,
  requester_id uuid not null,
  requester_role text not null check (requester_role in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff')),
  is_draft boolean not null default false,
  required_level text not null check (required_level in ('L0', 'L1', 'L2', 'L3', 'L2+L3')),
  current_level text not null check (current_level in ('L0', 'L1', 'L2', 'L3')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'escalated', 'expired', 'cancelled')),
  escalation_count integer not null default 0 check (escalation_count between 0 and 5),
  decision_reason text check (char_length(decision_reason) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.approval_steps (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  request_id uuid not null references public.approval_requests (id) on delete restrict,
  step_order integer not null check (step_order between 1 and 10),
  level text not null check (level in ('L1', 'L2', 'L3')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'skipped', 'escalated')),
  sla_due_at timestamptz not null,
  decided_by uuid,
  decided_role text,
  acted_for uuid,
  reason text check (char_length(reason) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.approval_delegations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  delegator_id uuid not null,
  delegator_role text not null check (delegator_role in ('super_admin', 'ceo', 'owner')),
  delegate_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (ends_at > starts_at),
  check (delegator_id <> delegate_id)
);

do $$
declare t text;
begin
  foreach t in array array['approval_rules', 'approval_requests', 'approval_steps', 'approval_delegations']
  loop
    perform public.apply_standard_triggers(('public.' || t)::regclass);
    perform public.audit_enable_for(('public.' || t)::regclass);
  end loop;
end
$$;

select public.rls_enable_default_deny('public.approval_rules');
select public.rls_enable_default_deny('public.approval_requests');
select public.rls_enable_default_deny('public.approval_steps');
select public.rls_enable_default_deny('public.approval_delegations');

create unique index if not exists uq_approval_rules_live on public.approval_rules (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), action) where deleted_at is null;
create index if not exists ix_approval_requests_company_status on public.approval_requests (company_id, status, created_at desc);
create index if not exists ix_approval_requests_requester on public.approval_requests (requester_id, created_at desc);
create unique index if not exists uq_approval_steps_order on public.approval_steps (request_id, step_order);
create index if not exists ix_approval_steps_due on public.approval_steps (sla_due_at) where status = 'pending';
create index if not exists ix_approval_delegations_delegate on public.approval_delegations (delegate_id, ends_at) where revoked_at is null;

-- Level helpers ------------------------------------------------------------------------------------------------------
create or replace function public.kd_level_rank(p_level text) returns integer
language sql immutable parallel safe
as $$ select case p_level when 'L1' then 1 when 'L2' then 2 when 'L3' then 3 else 0 end $$;

-- True when this role may decide a step of this level (company match is checked by the caller).
create or replace function public.kd_role_can_decide(p_role text, p_level text) returns boolean
language sql immutable parallel safe
as $$
  select case p_level
    when 'L1' then p_role in ('owner', 'ceo', 'super_admin')
    when 'L2' then p_role in ('ceo', 'super_admin')
    when 'L3' then p_role = 'super_admin'
    else false end
$$;

create or replace function public.kd_solo_mode() returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.feature_flags
    where key = 'approval.solo_mode' and company_id is null and enabled and deleted_at is null)
$$;

-- Create a request and its steps. L0 is approved at once. A staff requester always starts with the owner (L1).
create or replace function public.kd_approval_create(
  p_company uuid, p_action text, p_payload jsonb, p_requester uuid, p_requester_role text,
  p_level text, p_sla_hours integer, p_is_draft boolean default false
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  rid uuid;
  levels text[];
  lvl text;
  ord integer := 0;
  effective text := p_level;
begin
  if p_level not in ('L0', 'L1', 'L2', 'L3', 'L2+L3') then
    raise exception 'unknown approval level %', p_level using errcode = '22023';
  end if;
  if p_requester_role = 'staff' and p_level <> 'L0' and p_company is null then
    raise exception 'staff requests need a company' using errcode = '22023';
  end if;
  levels := case effective
    when 'L0' then '{}'::text[] when 'L1' then array['L1'] when 'L2' then array['L2']
    when 'L3' then array['L3'] else array['L2', 'L3'] end;
  if p_requester_role = 'staff' and p_level <> 'L0' and not ('L1' = any (levels)) then
    levels := array['L1'] || levels;
  end if;
  insert into public.approval_requests (company_id, action, payload, requester_id, requester_role, is_draft,
    required_level, current_level, status, decided_at)
  values (p_company, p_action, coalesce(p_payload, '{}'::jsonb), p_requester, p_requester_role, p_is_draft, p_level,
    coalesce(levels[1], 'L0'), case when cardinality(levels) = 0 then 'approved' else 'pending' end,
    case when cardinality(levels) = 0 then now() end)
  returning id into rid;
  foreach lvl in array levels loop
    ord := ord + 1;
    insert into public.approval_steps (company_id, request_id, step_order, level, sla_due_at)
    values (p_company, rid, ord, lvl, now() + make_interval(hours => p_sla_hours));
  end loop;
  return rid;
end
$$;

-- Decide the first open step. All authority rules are enforced here, inside one transaction with a row lock.
create or replace function public.kd_approval_decide(
  p_request uuid, p_approver uuid, p_approver_role text, p_approver_company uuid,
  p_decision text, p_reason text, p_acted_for uuid default null, p_acted_for_role text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  req public.approval_requests;
  stp public.approval_steps;
  authority_role text := coalesce(p_acted_for_role, p_approver_role);
  other_approver uuid;
  open_steps integer;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;
  if p_decision = 'reject' and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'a rejection needs a reason' using errcode = '22023';
  end if;
  select * into req from public.approval_requests where id = p_request and deleted_at is null for update;
  if not found then
    raise exception 'request not found' using errcode = '02000';
  end if;
  if req.status not in ('pending', 'escalated') then
    raise exception 'request is already %', req.status using errcode = '55000';
  end if;
  -- Tenant isolation: an owner can only decide requests of the own company; foreign ids look like missing rows.
  if p_approver_role = 'owner' and req.company_id is distinct from p_approver_company then
    raise exception 'request not found' using errcode = '02000';
  end if;
  if p_approver = req.requester_id and not (public.kd_solo_mode() and p_approver_role = 'super_admin') then
    raise exception 'you cannot decide your own request' using errcode = '42501';
  end if;
  if p_acted_for is not null then
    if p_acted_for = req.requester_id then
      raise exception 'the requester cannot be represented' using errcode = '42501';
    end if;
    if not exists (select 1 from public.approval_delegations d
      where d.delegator_id = p_acted_for and d.delegate_id = p_approver and d.revoked_at is null
        and d.deleted_at is null and now() between d.starts_at and d.ends_at
        and d.delegator_role = p_acted_for_role and d.company_id is not distinct from req.company_id) then
      raise exception 'no active delegation' using errcode = '42501';
    end if;
  end if;

  select * into stp from public.approval_steps
  where request_id = req.id and status in ('pending') and deleted_at is null order by step_order limit 1 for update;
  if not found then
    raise exception 'no open step' using errcode = '55000';
  end if;
  if not public.kd_role_can_decide(authority_role, stp.level) then
    raise exception 'this level needs a higher role' using errcode = '42501';
  end if;
  select s.decided_by into other_approver from public.approval_steps s
  where s.request_id = req.id and s.status = 'approved' and s.decided_by is not null order by s.step_order desc limit 1;
  if other_approver = p_approver and req.required_level = 'L2+L3' then
    raise exception 'dual approval needs two different people' using errcode = '42501';
  end if;

  update public.approval_steps set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
    decided_by = p_approver, decided_role = p_approver_role, acted_for = p_acted_for, reason = p_reason, decided_at = now()
  where id = stp.id;

  if p_decision = 'reject' then
    update public.approval_steps set status = 'skipped' where request_id = req.id and status = 'pending';
    update public.approval_requests set status = 'rejected', decision_reason = p_reason, decided_at = now() where id = req.id;
  else
    select count(*) into open_steps from public.approval_steps where request_id = req.id and status = 'pending';
    if open_steps = 0 then
      update public.approval_requests set status = 'approved', decided_at = now() where id = req.id;
    else
      update public.approval_requests set status = 'pending',
        current_level = (select s.level from public.approval_steps s where s.request_id = req.id and s.status = 'pending' order by s.step_order limit 1)
      where id = req.id;
    end if;
  end if;
  select * into req from public.approval_requests where id = p_request;
  return jsonb_build_object('requestId', req.id, 'status', req.status, 'requiredLevel', req.required_level, 'currentLevel', req.current_level);
end
$$;

-- Escalate overdue steps to the next level. Past L3 the request expires. Returns the number of requests changed.
create or replace function public.kd_approval_escalate(p_now timestamptz default now()) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s public.approval_steps;
  r public.approval_requests;
  changed integer := 0;
  next_level text;
begin
  for s in select * from public.approval_steps
    where status = 'pending' and sla_due_at <= p_now and deleted_at is null order by sla_due_at for update skip locked
  loop
    select * into r from public.approval_requests where id = s.request_id and status in ('pending', 'escalated') for update;
    if not found then continue; end if;
    next_level := case s.level when 'L1' then 'L2' when 'L2' then 'L3' else null end;
    update public.approval_steps set status = 'escalated', decided_at = p_now where id = s.id;
    if next_level is null or exists (select 1 from public.approval_steps x where x.request_id = r.id and x.level = next_level and x.status = 'pending') then
      if next_level is null then
        update public.approval_steps set status = 'skipped' where request_id = r.id and status = 'pending';
        update public.approval_requests set status = 'expired', decided_at = p_now where id = r.id;
      end if;
    else
      insert into public.approval_steps (company_id, request_id, step_order, level, sla_due_at)
      values (r.company_id, r.id, (select max(step_order) + 1 from public.approval_steps where request_id = r.id), next_level, p_now + interval '24 hours');
      update public.approval_requests set status = 'escalated', current_level = next_level, escalation_count = least(escalation_count + 1, 5) where id = r.id;
    end if;
    changed := changed + 1;
  end loop;
  return changed;
end
$$;

-- Access --------------------------------------------------------------------------------------------------------------
revoke all on public.approval_rules, public.approval_requests, public.approval_steps, public.approval_delegations from authenticated;
grant select on public.approval_rules, public.approval_requests, public.approval_steps to authenticated;
grant select, insert, update on public.approval_delegations to authenticated;
grant insert, update on public.approval_rules to authenticated;
grant all on public.approval_rules, public.approval_requests, public.approval_steps, public.approval_delegations to service_role;

drop policy if exists approval_rules_select on public.approval_rules;
create policy approval_rules_select on public.approval_rules for select to authenticated
  using (deleted_at is null and (company_id is null or company_id = (select public.app_company_id()) or (select public.app_is_platform())));
drop policy if exists approval_rules_write on public.approval_rules;
create policy approval_rules_write on public.approval_rules for insert to authenticated with check ((select public.app_is_super_admin()));
drop policy if exists approval_rules_update on public.approval_rules;
create policy approval_rules_update on public.approval_rules for update to authenticated
  using ((select public.app_is_super_admin())) with check ((select public.app_is_super_admin()));

drop policy if exists approval_requests_select on public.approval_requests;
create policy approval_requests_select on public.approval_requests for select to authenticated
  using (deleted_at is null and (
    (select public.app_is_platform())
    or (company_id = (select public.app_company_id()) and ((select public.app_role()) = 'owner' or requester_id = (select auth.uid())))));

drop policy if exists approval_steps_select on public.approval_steps;
create policy approval_steps_select on public.approval_steps for select to authenticated
  using (deleted_at is null and exists (select 1 from public.approval_requests r where r.id = request_id));

drop policy if exists approval_delegations_select on public.approval_delegations;
create policy approval_delegations_select on public.approval_delegations for select to authenticated
  using (deleted_at is null and (delegator_id = (select auth.uid()) or delegate_id = (select auth.uid())
    or (select public.app_is_platform()) or (company_id = (select public.app_company_id()) and (select public.app_role()) = 'owner')));
drop policy if exists approval_delegations_insert on public.approval_delegations;
create policy approval_delegations_insert on public.approval_delegations for insert to authenticated
  with check (delegator_id = (select auth.uid()) and delegator_role = (select public.app_role())
    and company_id is not distinct from (select public.app_company_id())
    and (select public.app_role()) in ('owner', 'ceo', 'super_admin'));
drop policy if exists approval_delegations_update on public.approval_delegations;
create policy approval_delegations_update on public.approval_delegations for update to authenticated
  using (delegator_id = (select auth.uid())) with check (delegator_id = (select auth.uid()));

revoke execute on function public.kd_approval_create(uuid, text, jsonb, uuid, text, text, integer, boolean),
  public.kd_approval_decide(uuid, uuid, text, uuid, text, text, uuid, text),
  public.kd_approval_escalate(timestamptz) from public, anon, authenticated;
grant execute on function public.kd_approval_create(uuid, text, jsonb, uuid, text, text, integer, boolean),
  public.kd_approval_decide(uuid, uuid, text, uuid, text, text, uuid, text),
  public.kd_approval_escalate(timestamptz) to service_role;
