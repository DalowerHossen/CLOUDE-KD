-- path: migrations/S06_003_legal.sql
-- STEP 06.4 Acceptance log of legal documents: who accepted which version of which document, and when.
-- A row is evidence: it is never changed, only added.

create table if not exists public.legal_acceptances (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid references public.companies (id) on delete restrict,
  subject text not null check (char_length(subject) between 8 and 80),
  user_id uuid,
  document_slug text not null check (document_slug ~ '^[a-z0-9-]{2,60}$'),
  document_version text not null check (char_length(document_version) between 1 and 40),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 80),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

select public.apply_standard_triggers('public.legal_acceptances');
select public.rls_enable_default_deny('public.legal_acceptances');
select public.audit_enable_for('public.legal_acceptances');

create unique index if not exists uq_legal_acceptance on public.legal_acceptances (subject, document_slug, document_version);
create index if not exists ix_legal_acceptance_user on public.legal_acceptances (user_id, document_slug, accepted_at desc) where user_id is not null;

revoke all on public.legal_acceptances from authenticated;
grant all on public.legal_acceptances to service_role;

create or replace function public.legal_acceptance_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'acceptance records cannot be deleted' using errcode = '22023';
  end if;
  if new.subject is distinct from old.subject or new.document_slug is distinct from old.document_slug
     or new.document_version is distinct from old.document_version or new.accepted_at is distinct from old.accepted_at
     or new.user_id is distinct from old.user_id then
    raise exception 'acceptance records cannot be changed' using errcode = '22023';
  end if;
  return new;
end
$$;
drop trigger if exists trg_legal_acceptance_guard on public.legal_acceptances;
create trigger trg_legal_acceptance_guard before update or delete on public.legal_acceptances
  for each row execute function public.legal_acceptance_guard();

-- Records an acceptance once per subject, document and version. Answers true when a new row was added.
create or replace function public.kd_legal_accept(p_subject text, p_user uuid, p_slug text, p_version text, p_ip_hash text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.legal_acceptances (subject, user_id, document_slug, document_version, ip_hash)
  values (p_subject, p_user, p_slug, p_version, p_ip_hash)
  on conflict (subject, document_slug, document_version) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

revoke all on function public.kd_legal_accept(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.kd_legal_accept(text, uuid, text, text, text) to service_role;
