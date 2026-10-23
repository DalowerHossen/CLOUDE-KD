-- path: migrations/S07_010_feedback.sql
-- STEP 07.11 Feedback and NPS: answers from company users, and the per-person state of the NPS prompt.

create table if not exists public.feedback_entries (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('nps', 'feedback')),
  score smallint check (score between 0 and 10),
  category text not null default 'other' check (category in ('idea', 'problem', 'praise', 'other')),
  comment text not null default '' check (char_length(comment) <= 2000),
  page text not null default '' check (char_length(page) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (kind <> 'nps' or score is not null),
  check (kind <> 'feedback' or char_length(comment) >= 1)
);

create table if not exists public.feedback_prompts (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  last_answered_at timestamptz,
  dismissed_until timestamptz,
  answered_count integer not null default 0 check (answered_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.feedback_entries');
select public.apply_standard_triggers('public.feedback_prompts');
select public.rls_enable_default_deny('public.feedback_entries');
select public.rls_enable_default_deny('public.feedback_prompts');
select public.audit_enable_for('public.feedback_entries');
select public.audit_enable_for('public.feedback_prompts');

create index if not exists ix_feedback_company on public.feedback_entries (company_id, created_at desc) where deleted_at is null;
create index if not exists ix_feedback_kind on public.feedback_entries (kind, created_at desc) where deleted_at is null;
create unique index if not exists uq_feedback_prompt_user on public.feedback_prompts (user_id) where deleted_at is null;

revoke all on public.feedback_entries, public.feedback_prompts from authenticated;
grant all on public.feedback_entries, public.feedback_prompts to service_role;

-- Records the answer once per call and moves the prompt state in the same step.
create or replace function public.kd_feedback_answered(p_company uuid, p_user uuid) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.feedback_prompts (company_id, user_id, last_answered_at, answered_count)
  values (p_company, p_user, now(), 1)
  on conflict (user_id) where deleted_at is null
  do update set last_answered_at = now(), answered_count = public.feedback_prompts.answered_count + 1, company_id = p_company;
end
$$;

create or replace function public.kd_feedback_dismissed(p_company uuid, p_user uuid, p_days integer) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.feedback_prompts (company_id, user_id, dismissed_until)
  values (p_company, p_user, now() + make_interval(days => p_days))
  on conflict (user_id) where deleted_at is null
  do update set dismissed_until = now() + make_interval(days => p_days), company_id = p_company;
end
$$;

revoke all on function public.kd_feedback_answered(uuid, uuid), public.kd_feedback_dismissed(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.kd_feedback_answered(uuid, uuid), public.kd_feedback_dismissed(uuid, uuid, integer) to service_role;
