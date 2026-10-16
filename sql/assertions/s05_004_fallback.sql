-- path: sql/assertions/s05_004_fallback.sql
-- One fallback notice per company and hour.
do $$
declare
  c uuid := public.uuid_generate_v7();
begin
  insert into public.companies (id, name, slug) values (c, 'S4', 'fallback-a');
  assert not public.kd_drive_claim_fallback_notice(c), 'no link, no notice';
  insert into public.drive_connections (company_id, refresh_token) values (c, '{"ciphertext":"x"}'::jsonb);
  assert public.kd_drive_claim_fallback_notice(c), 'first notice is allowed';
  assert not public.kd_drive_claim_fallback_notice(c), 'second notice inside the hour is refused';
  update public.drive_connections set last_fallback_notified_at = now() - interval '61 minutes' where company_id = c;
  assert public.kd_drive_claim_fallback_notice(c), 'allowed again after an hour';
end
$$;
