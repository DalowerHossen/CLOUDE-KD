-- path: migrations/S05_001_encryption_down.sql
drop table if exists public.key_rotation_runs;
drop table if exists public.secret_access_log;
