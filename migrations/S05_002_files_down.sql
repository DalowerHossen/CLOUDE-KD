-- path: migrations/S05_002_files_down.sql
drop function if exists public.kd_upload_purge();
drop function if exists public.kd_known_malware(text);
drop function if exists public.kd_company_storage_bytes(uuid);
drop function if exists public.kd_upload_usage_add(uuid, bigint, bigint);
drop function if exists public.kd_upload_begin_complete(uuid, uuid);
drop function if exists public.kd_upload_chunk_put(uuid, integer, bytea);
drop table if exists public.upload_usage;
drop table if exists public.upload_chunks;
drop table if exists public.upload_sessions;
drop table if exists public.malware_hashes;
drop table if exists public.file_quarantine;
drop table if exists public.files;
