-- path: migrations/S06_007_marketing.sql
-- STEP 06.8 Marketing: testimonials, leads, e-mail campaigns and A/B experiments of the public site.

create table if not exists public.testimonials (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  quote text not null check (char_length(quote) between 10 and 400),
  person_name text not null check (char_length(person_name) between 2 and 80),
  person_role text not null default '' check (char_length(person_role) <= 80),
  organization text not null default '' check (char_length(organization) <= 80),
  approved boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.leads (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null default '' check (char_length(full_name) <= 100),
  source text not null check (source in ('newsletter', 'invoice_generator', 'calculator', 'template', 'contact', 'other')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'unsubscribed')),
  marketing_ok boolean not null default false,
  note text not null default '' check (char_length(note) <= 1000),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.campaigns (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  name text not null check (char_length(name) between 3 and 80),
  subject text not null check (char_length(subject) between 3 and 150),
  body_text text not null check (char_length(body_text) between 10 and 8000),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.ab_experiments (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  key text not null check (key ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(name) between 3 and 80),
  goal_event text not null check (goal_event in ('signup_click', 'contact_sent', 'cta_click', 'free_tool_used')),
  variants jsonb not null check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 2 and 4),
  status text not null default 'draft' check (status in ('draft', 'running', 'stopped')),
  winner text check (winner is null or winner ~ '^[a-z0-9-]{1,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.ab_stats (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  experiment_key text not null,
  variant text not null check (variant ~ '^[a-z0-9-]{1,20}$'),
  day date not null,
  exposures bigint not null default 0 check (exposures >= 0),
  conversions bigint not null default 0 check (conversions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.testimonials');
select public.apply_standard_triggers('public.leads');
select public.apply_standard_triggers('public.campaigns');
select public.apply_standard_triggers('public.ab_experiments');
select public.apply_standard_triggers('public.ab_stats');
select public.rls_enable_default_deny('public.testimonials');
select public.rls_enable_default_deny('public.leads');
select public.rls_enable_default_deny('public.campaigns');
select public.rls_enable_default_deny('public.ab_experiments');
select public.rls_enable_default_deny('public.ab_stats');
select public.audit_enable_for('public.testimonials');
select public.audit_enable_for('public.leads');
select public.audit_enable_for('public.campaigns');
select public.audit_enable_for('public.ab_experiments');

create unique index if not exists uq_leads_email on public.leads (email) where deleted_at is null;
create index if not exists ix_leads_status on public.leads (status, created_at desc) where deleted_at is null;
create unique index if not exists uq_ab_key on public.ab_experiments (key) where deleted_at is null;
create unique index if not exists uq_ab_stats on public.ab_stats (experiment_key, variant, day);
create index if not exists ix_testimonials_public on public.testimonials (sort_order) where approved and deleted_at is null;

revoke all on public.testimonials, public.leads, public.campaigns, public.ab_experiments, public.ab_stats from authenticated;
grant all on public.testimonials, public.leads, public.campaigns, public.ab_experiments, public.ab_stats to service_role;

-- Adds an exposure or a conversion of a variant for today (UTC) of a running experiment.
create or replace function public.kd_ab_count(p_key text, p_variant text, p_kind text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (select 1 from public.ab_experiments where key = p_key and status = 'running' and deleted_at is null and winner is null
    and exists (select 1 from jsonb_array_elements(variants) v where v->>'key' = p_variant)) into ok;
  if not ok then return false; end if;
  insert into public.ab_stats (experiment_key, variant, day, exposures, conversions)
  values (p_key, p_variant, (now() at time zone 'utc')::date, case when p_kind = 'exposure' then 1 else 0 end, case when p_kind = 'conversion' then 1 else 0 end)
  on conflict (experiment_key, variant, day) do update set
    exposures = public.ab_stats.exposures + case when p_kind = 'exposure' then 1 else 0 end,
    conversions = public.ab_stats.conversions + case when p_kind = 'conversion' then 1 else 0 end;
  return true;
end
$$;

revoke all on function public.kd_ab_count(text, text, text) from public, anon, authenticated;
grant execute on function public.kd_ab_count(text, text, text) to service_role;
