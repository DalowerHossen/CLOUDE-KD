-- path: migrations/S15_005_expenses_down.sql
drop table if exists public.recurring_expenses;
drop table if exists public.expense_policies;
drop table if exists public.receipts;
drop table if exists public.expenses;
drop table if exists public.expense_categories;
drop function if exists public.kd_expense_guard();
drop function if exists public.kd_expense_category_guard();
