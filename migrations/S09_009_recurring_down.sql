-- path: migrations/S09_009_recurring_down.sql
drop function if exists public.kd_recurring_fail(uuid, text, integer);
drop function if exists public.kd_recurring_complete(uuid, uuid, date, text);
drop function if exists public.kd_recurring_claim(uuid, date);
drop table if exists public.recurring_runs;
drop table if exists public.recurring_schedules;
drop index if exists public.uq_invoice_recurring_run;
alter table public.invoices drop column if exists recurring_run_id;
