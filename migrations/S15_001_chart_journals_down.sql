-- path: migrations/S15_001_chart_journals_down.sql
drop function if exists public.kd_journal_balances(uuid, date);
drop function if exists public.kd_journal_reverse(uuid, uuid, date, text, uuid);
drop function if exists public.kd_journal_replace(uuid, uuid, integer, date, text, text, jsonb, uuid);
drop function if exists public.kd_journal_create(uuid, date, text, text, text, text, text, jsonb, uuid, text, boolean, text, uuid, text);
drop function if exists public.kd_journal_post(uuid, uuid, uuid);
drop function if exists public.kd_journal_number(uuid, integer);
drop table if exists public.journal_attachments;
drop table if exists public.journal_templates;
drop table if exists public.journal_lines;
drop table if exists public.journal_entries;
drop table if exists public.journal_counters;
drop table if exists public.account_mappings;
drop table if exists public.account_history;
drop table if exists public.accounts;
drop function if exists public.kd_journal_entry_guard();
drop function if exists public.kd_journal_line_guard();
drop function if exists public.kd_accounts_guard();
