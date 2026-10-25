-- path: migrations/S16_023_plan_unlimited_value.sql
-- Fix: "no limit" of a plan feature is stored as an empty value (NULL). The API cannot write a JSON null into a jsonb
-- column (it becomes NULL), so the enterprise plan could never be saved. The two value checks accept NULL already.

alter table public.plan_entitlements alter column value drop not null;

comment on column public.plan_entitlements.value is
  'true or false (a switch), a number (a limit) or NULL (no limit).';
