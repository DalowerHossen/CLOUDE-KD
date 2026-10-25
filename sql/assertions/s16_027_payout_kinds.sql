-- path: sql/assertions/s16_027_payout_kinds.sql
-- Payout methods accept the seven known ways and nothing else.
do $$
declare cid uuid;
begin
  insert into public.companies (name, slug) values ('Payout kinds co', 'payout-kinds-co') returning id into cid;
  insert into public.payout_methods (company_id, kind, label, details_encrypted) values (cid, 'ach', 'a', '{}'::jsonb);
  insert into public.payout_methods (company_id, kind, label, details_encrypted) values (cid, 'paypal', 'b', '{}'::jsonb);
  insert into public.payout_methods (company_id, kind, label, details_encrypted) values (cid, 'payoneer', 'c', '{}'::jsonb);
  insert into public.payout_methods (company_id, kind, label, details_encrypted) values (cid, 'e_wallet', 'd', '{}'::jsonb);
  begin
    insert into public.payout_methods (company_id, kind, label, details_encrypted) values (cid, 'cash', 'e', '{}'::jsonb);
    assert false, 'unknown kind accepted';
  exception when check_violation then null; end;
end $$;
