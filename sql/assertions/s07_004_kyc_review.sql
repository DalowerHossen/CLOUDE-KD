-- path: sql/assertions/s07_004_kyc_review.sql
-- KYC review columns: screening state is checked and defaults to "not run".
do $$
declare
  c uuid;
  s uuid;
begin
  insert into public.companies (name, slug) values ('Kyc Review', 'kyc-review') returning id into c;
  insert into public.kyc_submissions (company_id) values (c) returning id into s;
  assert (select screening_status from public.kyc_submissions where id = s) = 'not_run', 'default state';
  update public.kyc_submissions set screening_status = 'clear', screened_at = now() where id = s;
  begin update public.kyc_submissions set screening_status = 'maybe' where id = s; assert false, 'state checked';
  exception when check_violation then null; end;
end
$$;
