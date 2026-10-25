-- path: migrations/S16_023_plan_unlimited_value_down.sql
-- Rows with no limit would block the constraint: turn them into JSON null first.
update public.plan_entitlements set value = 'null'::jsonb where value is null;
alter table public.plan_entitlements alter column value set not null;
comment on column public.plan_entitlements.value is null;
