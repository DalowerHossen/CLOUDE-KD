-- path: migrations/S02_005_approvals_down.sql
drop function if exists public.kd_approval_escalate(timestamptz);
drop function if exists public.kd_approval_decide(uuid, uuid, text, uuid, text, text, uuid, text);
drop function if exists public.kd_approval_create(uuid, text, jsonb, uuid, text, text, integer, boolean);
drop function if exists public.kd_solo_mode();
drop function if exists public.kd_role_can_decide(text, text);
drop function if exists public.kd_level_rank(text);
drop table if exists public.approval_delegations;
drop table if exists public.approval_steps;
drop table if exists public.approval_requests;
drop table if exists public.approval_rules;
