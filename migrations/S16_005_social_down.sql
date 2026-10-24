-- path: migrations/S16_005_social_down.sql
drop table if exists public.social_hashtag_groups;
drop table if exists public.social_posts;
drop table if exists public.social_accounts;
drop function if exists public.kd_social_post_guard();
drop function if exists public.kd_social_account_guard();
