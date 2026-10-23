-- path: migrations/S05_004_storage_fallback.sql
-- STEP 05.4 Remembers when the owner was last told about a fallback, so a long outage sends one notice per hour.

alter table public.drive_connections add column if not exists last_fallback_notified_at timestamptz;

-- Atomically claims the right to notify: true for the first caller in each hour, false for the others.
create or replace function public.kd_drive_claim_fallback_notice(p_company uuid) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  update public.drive_connections
    set last_fallback_notified_at = now()
    where company_id = p_company and deleted_at is null
      and (last_fallback_notified_at is null or last_fallback_notified_at < now() - interval '1 hour');
  return found;
end
$$;

revoke all on function public.kd_drive_claim_fallback_notice(uuid) from public, anon, authenticated;
grant execute on function public.kd_drive_claim_fallback_notice(uuid) to service_role;
