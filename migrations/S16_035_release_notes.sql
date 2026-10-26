-- path: migrations/S16_035_release_notes.sql
-- STEP 16 "What's new" and product tours: the platform team publishes release notes (each may carry the steps of a short tour)
-- and every company user has a private record of what they have seen. Only the service role reads or writes.

create table if not exists public.release_notes (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 4000),
  kind text not null default 'feature' check (kind in ('feature', 'improvement', 'fix')),
  audience text not null default 'all' check (audience in ('all', 'owners')),
  tour jsonb not null default '[]'::jsonb check (jsonb_typeof(tour) = 'array' and jsonb_array_length(tour) <= 8 and pg_column_size(tour) <= 8192),
  status text not null default 'published' check (status in ('published', 'withdrawn')),
  published_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create index if not exists ix_release_notes_live on public.release_notes (published_at desc) where status = 'published' and deleted_at is null;

create table if not exists public.release_note_reads (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null,
  note_id uuid not null references public.release_notes (id) on delete restrict,
  seen_at timestamptz not null default now(),
  tour_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);
create unique index if not exists uq_release_note_read on public.release_note_reads (user_id, note_id) where deleted_at is null;
create index if not exists ix_release_note_reads_user on public.release_note_reads (user_id) where deleted_at is null;

select public.apply_standard_triggers('public.release_notes');
select public.apply_standard_triggers('public.release_note_reads');
select public.rls_enable_default_deny('public.release_notes');
select public.rls_enable_default_deny('public.release_note_reads');
select public.audit_enable_for('public.release_notes');
select public.audit_enable_for('public.release_note_reads');
revoke all on public.release_notes, public.release_note_reads from authenticated;
grant all on public.release_notes, public.release_note_reads to service_role;
