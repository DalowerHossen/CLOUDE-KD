-- path: migrations/S05_005_storage_migrations_down.sql
drop function if exists public.kd_migration_item_result(uuid, text, text);
drop function if exists public.kd_migration_claim(integer);
drop function if exists public.kd_migration_enqueue_all(uuid);
drop table if exists public.storage_migration_items;
drop table if exists public.storage_migrations;
