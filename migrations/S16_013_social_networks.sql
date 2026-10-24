-- path: migrations/S16_013_social_networks.sql
-- STEP 16.4.a2 Social networks: LinkedIn, X, Telegram and Pinterest accounts. The list of networks grows, and the id of an account
-- takes the shape each network uses (a LinkedIn author URN, a numeric X user id, a Telegram chat id or @name, a Pinterest board id).
alter table public.social_accounts drop constraint if exists social_accounts_provider_check;
alter table public.social_accounts add constraint social_accounts_provider_check
  check (provider in ('facebook', 'instagram', 'threads', 'linkedin', 'x', 'telegram', 'pinterest', 'sandbox'));

alter table public.social_accounts drop constraint if exists social_accounts_external_id_check;
alter table public.social_accounts add constraint social_accounts_external_id_check check (
  case provider
    when 'linkedin' then external_id ~ '^urn:li:(organization|person):[0-9A-Za-z_-]{1,40}$'
    when 'x' then external_id ~ '^[0-9]{1,19}$'
    when 'telegram' then external_id ~ '^(-?[0-9]{1,20}|@[A-Za-z][0-9A-Za-z_]{4,31})$'
    when 'pinterest' then external_id ~ '^[0-9]{1,30}$'
    else external_id ~ '^[0-9A-Za-z_.-]{1,60}$'
  end
);
