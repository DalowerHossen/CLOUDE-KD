-- path: migrations/S06_002_cms_down.sql
drop function if exists public.kd_cms_revert(text, integer, uuid);
drop function if exists public.kd_cms_release_due();
drop function if exists public.kd_cms_to_draft(uuid);
drop function if exists public.kd_cms_mark_pending(uuid, uuid, timestamptz);
drop function if exists public.kd_cms_publish(uuid, timestamptz);
drop function if exists public.kd_cms_save_draft(text, text, text, text, jsonb, uuid, text);
drop trigger if exists trg_cms_version_content on public.cms_page_versions;
drop function if exists public.cms_version_content_guard();
drop table if exists public.cms_page_versions;
drop table if exists public.cms_pages;
