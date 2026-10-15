-- path: migrations/S02_001_foundation_down.sql
drop function if exists public.is_snake_token(text);
drop function if exists public.create_live_unique_index(regclass, text);
drop function if exists public.rls_enable_default_deny(regclass);
drop function if exists public.apply_standard_triggers(regclass);
drop function if exists public.soft_delete_guard();
drop function if exists public.bump_version();
drop function if exists public.set_updated_at();
drop function if exists public.uuid_generate_v7();
