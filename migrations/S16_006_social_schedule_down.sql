-- path: migrations/S16_006_social_schedule_down.sql
drop function if exists public.kd_social_click(text);
drop table if exists public.social_post_stats;
drop table if exists public.social_link_hours;
drop table if exists public.social_links;
drop table if exists public.social_evergreen_plans;
drop table if exists public.social_evergreen_items;
drop table if exists public.social_rule_runs;
drop table if exists public.social_rules;
drop table if exists public.social_schedules;
drop table if exists public.social_post_approvals;
drop table if exists public.social_settings;
alter table public.social_posts
  drop column if exists track_links, drop column if exists approval_status, drop column if exists approval_requested_at,
  drop column if exists approval_decided_at, drop column if exists approval_decided_by, drop column if exists approval_reason,
  drop column if exists approval_request_id, drop column if exists schedule_id, drop column if exists schedule_slot,
  drop column if exists rule_id, drop column if exists evergreen_item_id;
alter table public.social_accounts drop column if exists max_posts_per_day;
drop function if exists public.kd_social_child_guard();
drop function if exists public.kd_social_append_only();
