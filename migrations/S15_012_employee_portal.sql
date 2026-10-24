-- path: migrations/S15_012_employee_portal.sql
-- STEP 15.9 Employee self-service portal.
--   employee_portal_links  the portal links issued to employees (the token itself is only in the tokens service as a hash; this
--                          table says who got one, when it expires and whether it was revoked or sent by e-mail).
--   employee_declarations  a tax declaration an employee sends from the portal (filing status and allowances); the owner decides.

create table if not exists public.employee_portal_links (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  token_id uuid not null,
  issued_by uuid,
  expires_at timestamptz not null,
  otp_required boolean not null default true,
  sent_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1
);

create table if not exists public.employee_declarations (
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  filing_status text not null default '' check (char_length(filing_status) <= 40),
  allowances integer not null default 0 check (allowances between 0 and 50),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  token_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  check ((status = 'pending') = (decided_at is null)),
  check (status <> 'rejected' or reject_reason is not null)
);

select public.apply_standard_triggers('public.employee_portal_links');
select public.apply_standard_triggers('public.employee_declarations');
select public.rls_enable_default_deny('public.employee_portal_links');
select public.rls_enable_default_deny('public.employee_declarations');
select public.audit_enable_for('public.employee_portal_links');
select public.audit_enable_for('public.employee_declarations');

create unique index if not exists uq_employee_portal_links_token on public.employee_portal_links (token_id);
create index if not exists ix_employee_portal_links_employee on public.employee_portal_links (employee_id, created_at desc) where deleted_at is null;
-- One declaration waits for a decision per employee.
create unique index if not exists uq_employee_declarations_pending on public.employee_declarations (employee_id) where status = 'pending' and deleted_at is null;
create index if not exists ix_employee_declarations_company on public.employee_declarations (company_id, status, created_at desc) where deleted_at is null;

-- The employee belongs to the company (both tables).
create or replace function public.kd_employee_portal_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.employees where id = new.employee_id and deleted_at is null;
  if v_company is null or v_company <> new.company_id then raise exception 'the employee was not found' using errcode = 'P0002'; end if;
  return new;
end
$$;
drop trigger if exists trg_employee_portal_links_guard on public.employee_portal_links;
create trigger trg_employee_portal_links_guard before insert or update on public.employee_portal_links for each row execute function public.kd_employee_portal_guard();
drop trigger if exists trg_employee_declarations_guard on public.employee_declarations;
create trigger trg_employee_declarations_guard before insert or update on public.employee_declarations for each row execute function public.kd_employee_portal_guard();

-- A revoked link stays revoked.
create or replace function public.kd_employee_link_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked link stays revoked' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_employee_portal_links_revoke on public.employee_portal_links;
create trigger trg_employee_portal_links_revoke before update on public.employee_portal_links for each row execute function public.kd_employee_link_guard();

-- A decided declaration does not change.
create or replace function public.kd_employee_declaration_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' and (new.status <> old.status or new.filing_status <> old.filing_status or new.allowances <> old.allowances) then
    raise exception 'a decided declaration cannot change' using errcode = '55000';
  end if;
  return new;
end
$$;
drop trigger if exists trg_employee_declarations_decided on public.employee_declarations;
create trigger trg_employee_declarations_decided before update on public.employee_declarations for each row execute function public.kd_employee_declaration_guard();

revoke all on public.employee_portal_links, public.employee_declarations from authenticated;
grant all on public.employee_portal_links, public.employee_declarations to service_role;
