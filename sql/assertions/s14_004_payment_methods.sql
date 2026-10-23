-- path: sql/assertions/s14_004_payment_methods.sql
-- Payment method settings: RLS on, one row per method, country and scope, a company row cannot carry a country, a fee or
-- a plan rule (only the platform team sets those), codes and countries are well formed.
do $$
declare
  c uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname = 'payment_method_settings' and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Methods Co', 'methods-co') returning id into c;
  insert into public.payment_method_settings (method_code, country, enabled) values ('mobile_wallet_a', 'BD', true);
  insert into public.payment_method_settings (method_code, country, enabled) values ('mobile_wallet_a', 'PK', true);
  begin insert into public.payment_method_settings (method_code, country, enabled) values ('mobile_wallet_a', 'BD', false);
    assert false, 'two platform rows for one method and country';
  exception when unique_violation then null; end;
  insert into public.payment_method_settings (company_id, method_code, enabled) values (c, 'mobile_wallet_a', true);
  begin insert into public.payment_method_settings (company_id, method_code, enabled) values (c, 'mobile_wallet_a', false);
    assert false, 'two company rows for one method';
  exception when unique_violation then null; end;
  begin insert into public.payment_method_settings (company_id, method_code, country) values (c, 'card', 'BD');
    assert false, 'a company row cannot carry a country';
  exception when check_violation then null; end;
  begin insert into public.payment_method_settings (company_id, method_code, fee_model) values (c, 'card', '{}'::jsonb);
    assert false, 'a company row cannot carry a fee';
  exception when check_violation then null; end;
  begin insert into public.payment_method_settings (method_code, country) values ('Bad Code', 'BD');
    assert false, 'bad code';
  exception when check_violation then null; end;
  begin insert into public.payment_method_settings (method_code, country) values ('card', 'bd');
    assert false, 'country must be upper case';
  exception when check_violation then null; end;
end
$$;
