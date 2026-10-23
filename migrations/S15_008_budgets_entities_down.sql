-- path: migrations/S15_008_budgets_entities_down.sql
drop table if exists public.intercompany_pairs;
drop table if exists public.entity_group_members;
drop table if exists public.entity_groups;
drop table if exists public.forecast_settings;
drop table if exists public.budget_alerts;
drop table if exists public.budget_lines;
drop table if exists public.budgets;
drop function if exists public.kd_entity_pair_guard();
drop function if exists public.kd_budget_line_guard();
drop function if exists public.kd_budget_guard();
