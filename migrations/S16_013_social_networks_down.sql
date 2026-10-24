-- path: migrations/S16_013_social_networks_down.sql
delete from public.social_accounts where provider in ('linkedin', 'x', 'telegram', 'pinterest');
alter table public.social_accounts drop constraint if exists social_accounts_external_id_check;
alter table public.social_accounts add constraint social_accounts_external_id_check check (external_id ~ '^[0-9A-Za-z_.-]{1,60}$');
alter table public.social_accounts drop constraint if exists social_accounts_provider_check;
alter table public.social_accounts add constraint social_accounts_provider_check check (provider in ('facebook', 'instagram', 'threads', 'sandbox'));
