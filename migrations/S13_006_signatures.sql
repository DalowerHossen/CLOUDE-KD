-- path: migrations/S13_006_signatures.sql
-- STEP 13.6.b Signing evidence. One signature per signer, never changed: the name the signer typed, how they signed (typed,
-- drawn or an uploaded image), the checksum of the wording they saw, the exact statement they accepted, and where and when
-- (masked and hashed address, the full address encrypted, browser, device, time). `kd_contract_sign` and
-- `kd_contract_decline` check the rules and write everything in one step. The signed PDF is kept as a stored file; its
-- checksum and seal go on the contract.

create table if not exists public.signatures (
  -- guard:append-only (signing evidence; rows are never changed)
  id uuid primary key default public.uuid_generate_v7(),
  company_id uuid not null references public.companies (id) on delete restrict,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  signer_id uuid not null references public.contract_signers (id) on delete restrict,
  token_id uuid,
  method text not null check (method in ('typed', 'drawn', 'uploaded')),
  typed_name text not null check (char_length(typed_name) between 2 and 200),
  image_file_id uuid,
  image_hash text check (image_hash is null or image_hash ~ '^[0-9a-f]{64}$'),
  doc_hash text not null check (doc_hash ~ '^[0-9a-f]{64}$'),
  statement_text text not null check (char_length(statement_text) between 20 and 2000),
  statement_hash text not null check (statement_hash ~ '^[0-9a-f]{64}$'),
  ip_masked text check (ip_masked is null or char_length(ip_masked) <= 64),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  ip_enc jsonb,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  device text check (device is null or char_length(device) <= 80),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (method = 'typed' or image_file_id is not null)
);

create unique index if not exists uq_signatures_signer on public.signatures (signer_id);
create index if not exists ix_signatures_contract on public.signatures (company_id, contract_id, signed_at);

drop trigger if exists trg_signatures_append on public.signatures;
create trigger trg_signatures_append before update or delete on public.signatures for each row execute function public.kd_invoice_append_only();
select public.rls_enable_default_deny('public.signatures');
revoke all on public.signatures from authenticated;
grant all on public.signatures to service_role;

alter table public.contracts add column if not exists archive_hash text check (archive_hash is null or archive_hash ~ '^[0-9a-f]{64}$');
alter table public.contracts add column if not exists seal text check (seal is null or seal ~ '^[0-9a-f]{64}$');

-- A signer signs. Errors: P0002 not found, 22023 the contract is closed or this signer is done, 55000 not this signer's
-- turn yet, 22000 the wording changed since the signer opened the page. Returns the new status of the contract.
create or replace function public.kd_contract_sign(
  p_company uuid, p_signer uuid, p_doc_hash text, p_method text, p_typed_name text, p_image_file uuid, p_image_hash text,
  p_statement text, p_statement_hash text, p_ip_masked text, p_ip_hash text, p_ip_enc jsonb, p_agent text, p_device text, p_token uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract uuid;
  v_signer_status text;
  v_position integer;
  v_status text;
  v_order text;
  v_hash text;
  v_left integer;
  v_new text;
begin
  select s.contract_id, s.status, s.position into v_contract, v_signer_status, v_position
    from public.contract_signers s where s.id = p_signer and s.company_id = p_company and s.deleted_at is null for update;
  if not found then raise exception 'signer not found' using errcode = 'P0002'; end if;
  select c.status, c.signing_order, c.body_hash into v_status, v_order, v_hash
    from public.contracts c where c.id = v_contract and c.company_id = p_company and c.deleted_at is null for update;
  if not found then raise exception 'contract not found' using errcode = 'P0002'; end if;
  if v_status not in ('sent', 'viewed', 'partly_signed') or v_signer_status not in ('pending', 'viewed') then
    raise exception 'not open for this signer' using errcode = '22023';
  end if;
  if v_hash is distinct from p_doc_hash then raise exception 'wording changed' using errcode = '22000'; end if;
  if v_order = 'sequential' and exists (
    select 1 from public.contract_signers o where o.contract_id = v_contract and o.deleted_at is null and o.position < v_position and o.status <> 'signed'
  ) then raise exception 'not your turn' using errcode = '55000'; end if;

  insert into public.signatures (company_id, contract_id, signer_id, token_id, method, typed_name, image_file_id, image_hash, doc_hash,
    statement_text, statement_hash, ip_masked, ip_hash, ip_enc, user_agent, device)
  values (p_company, v_contract, p_signer, p_token, p_method, p_typed_name, p_image_file, p_image_hash, p_doc_hash,
    p_statement, p_statement_hash, p_ip_masked, p_ip_hash, p_ip_enc, p_agent, p_device);
  update public.contract_signers set status = 'signed', signed_at = now() where id = p_signer;
  select count(*) into v_left from public.contract_signers where contract_id = v_contract and deleted_at is null and status <> 'signed';
  v_new := case when v_left = 0 then 'signed' else 'partly_signed' end;
  update public.contracts set status = v_new, signed_at = case when v_left = 0 then now() else signed_at end where id = v_contract;
  insert into public.contract_events (company_id, contract_id, signer_id, kind, detail) values (p_company, v_contract, p_signer, 'signed', p_method);
  return v_new;
end
$$;

-- A signer declines: the contract can no longer be fully signed, so it ends as declined.
create or replace function public.kd_contract_decline(p_company uuid, p_signer uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract uuid;
  v_signer_status text;
  v_status text;
begin
  select s.contract_id, s.status into v_contract, v_signer_status
    from public.contract_signers s where s.id = p_signer and s.company_id = p_company and s.deleted_at is null for update;
  if not found then raise exception 'signer not found' using errcode = 'P0002'; end if;
  select c.status into v_status from public.contracts c where c.id = v_contract and c.company_id = p_company and c.deleted_at is null for update;
  if not found then raise exception 'contract not found' using errcode = 'P0002'; end if;
  if v_status not in ('sent', 'viewed', 'partly_signed') or v_signer_status not in ('pending', 'viewed') then
    raise exception 'not open for this signer' using errcode = '22023';
  end if;
  update public.contract_signers set status = 'declined' where id = p_signer;
  update public.contracts set status = 'declined', closed_reason = left(p_reason, 500) where id = v_contract;
  insert into public.contract_events (company_id, contract_id, signer_id, kind, detail) values (p_company, v_contract, p_signer, 'declined', left(p_reason, 480));
  return v_contract;
end
$$;

revoke execute on function public.kd_contract_sign(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.kd_contract_sign(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb, text, text, uuid) to service_role;
revoke execute on function public.kd_contract_decline(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kd_contract_decline(uuid, uuid, text) to service_role;
