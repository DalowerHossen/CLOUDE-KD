-- path: migrations/S05_008_notifications_down.sql
drop function if exists public.kd_notification_purge();
drop function if exists public.kd_notification_mark_read(uuid, uuid[]);
drop function if exists public.kd_notify_insert(uuid, uuid, text, text, text, text, text, text, integer);
drop table if exists public.notification_settings;
drop table if exists public.notification_mutes;
drop table if exists public.notification_preferences;
drop table if exists public.notifications;
