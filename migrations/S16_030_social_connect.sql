-- path: migrations/S16_030_social_connect.sql
-- STEP 16 "Connect with Facebook". An owner logs in with Facebook through the platform's Meta app; the platform gets the list of
-- Pages (and their Instagram accounts) and lets the owner choose which to connect. Between the login and the choice the list
-- (with the Page tokens, sealed) waits here for a few minutes. The state of the login is kept only as a hash.

create table if not exists public.social_connect_sessions (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  data_enc jsonb check (data_enc is null or jsonb_typeof(data_enc) = 'object'),
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create unique index if not exists uq_social_connect_state on public.social_connect_sessions (state_hash);
create index if not exists ix_social_connect_expiry on public.social_connect_sessions (expires_at) where deleted_at is null;

select public.apply_standard_triggers('public.social_connect_sessions');
select public.rls_enable_default_deny('public.social_connect_sessions');
select public.audit_enable_for('public.social_connect_sessions');
