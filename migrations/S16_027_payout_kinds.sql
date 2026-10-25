-- path: migrations/S16_027_payout_kinds.sql
-- STEP 16 Payout methods: the owner picks a country and then a way to be paid. Adds ACH (United States), e-wallet,
-- PayPal and Payoneer next to bank transfer, international wire and Global Payout Partners.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.payout_methods'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%partner_payout%'
  loop
    execute format('alter table public.payout_methods drop constraint %I', c);
  end loop;
end
$$;

alter table public.payout_methods add constraint payout_methods_kind_check
  check (kind in ('ach', 'wire', 'bank_transfer', 'e_wallet', 'paypal', 'payoneer', 'partner_payout'));

-- The company row now follows the country of the profile; fill it for companies that saved their profile earlier.
update public.companies c
   set country_code = upper(trim(s.value ->> 'country'))
  from public.company_settings s
 where s.company_id = c.id and s.section = 'profile' and s.deleted_at is null
   and c.country_code is null and upper(trim(s.value ->> 'country')) ~ '^[A-Z]{2}$';
