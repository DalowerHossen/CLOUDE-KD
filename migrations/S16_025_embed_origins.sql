-- path: migrations/S16_025_embed_origins.sql
-- STEP 16 Embedded checkout. A merchant lists the web sites (origins) that may show its payment links inside an iframe.
-- Only these origins are allowed in the frame-ancestors rule of the embed page and in the CORS answer of the embed API.

create table if not exists public.checkout_embed_origins (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  origin text not null check (char_length(origin) <= 200 and origin ~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check (origin ~ '^https://' or origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$')
);

select public.apply_standard_triggers('public.checkout_embed_origins');
select public.rls_enable_default_deny('public.checkout_embed_origins');
select public.audit_enable_for('public.checkout_embed_origins');
select public.create_live_unique_index('public.checkout_embed_origins', 'company_id, origin');
create index if not exists idx_checkout_embed_origins_company on public.checkout_embed_origins (company_id) where deleted_at is null;
