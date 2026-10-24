-- path: sql/assertions/s09_001_tax_fx.sql
-- Tax rates, tax settings, client exemptions and exchange rates: limits, uniqueness and the rate lookup order.
do $$
declare
  c uuid; c2 uuid; cl uuid; r record;
begin
  insert into public.companies (name, slug) values ('Tax Co', 'tax-co') returning id into c;
  insert into public.companies (name, slug) values ('Tax Two', 'tax-two') returning id into c2;
  insert into public.tax_rates (company_id, code, name, rate) values (c, 'VAT', 'VAT', 15);
  insert into public.tax_rates (company_id, code, name, rate) values (c2, 'VAT', 'VAT', 10);
  begin insert into public.tax_rates (company_id, code, name, rate) values (c, 'VAT', 'Again', 5); assert false, 'code unique per company';
  exception when unique_violation then null; end;
  begin insert into public.tax_rates (company_id, code, name, rate) values (c, 'BAD', 'Bad', 101); assert false, 'rate at most 100';
  exception when check_violation then null; end;
  begin insert into public.tax_rates (company_id, code, name, rate) values (c, 'low', 'Lower case', 5); assert false, 'code upper case';
  exception when check_violation then null; end;

  insert into public.tax_settings (company_id) values (c);
  begin insert into public.tax_settings (company_id) values (c); assert false, 'one settings row per company';
  exception when unique_violation then null; end;
  begin update public.tax_settings set precision = 6 where company_id = c; assert false, 'six places cannot be stored';
  exception when check_violation then null; end;
  begin update public.tax_settings set cash_rounding = '0.07' where company_id = c; assert false, 'known cash rounding steps';
  exception when check_violation then null; end;

  insert into public.clients (company_id, name, billing_postal_code, billing_country) values (c, 'Exempt Client', '10001', 'US') returning id into cl;
  insert into public.client_tax_exemptions (company_id, client_id, tax_exempt, reason) values (c, cl, true, 'Resale certificate');
  begin insert into public.client_tax_exemptions (company_id, client_id) values (c, cl); assert false, 'one exemption row per client';
  exception when unique_violation then null; end;

  begin insert into public.fx_rates (currency, rate, as_of) values ('USD', 1, current_date); assert false, 'no rate for the dollar itself';
  exception when check_violation then null; end;
  begin insert into public.fx_rates (currency, rate, as_of) values ('EUR', 0, current_date); assert false, 'rate above zero';
  exception when check_violation then null; end;
  insert into public.fx_rates (currency, rate, as_of, source) values ('EUR', 0.9, current_date - 5, 'provider');
  insert into public.fx_rates (currency, rate, as_of, source) values ('EUR', 0.95, current_date - 2, 'provider');
  begin insert into public.fx_rates (currency, rate, as_of) values ('EUR', 0.96, current_date - 2); assert false, 'one platform rate per day';
  exception when unique_violation then null; end;
  select * into r from public.kd_fx_rate(c, 'EUR', current_date);
  assert r.rate = 0.95 and r.as_of = current_date - 2, 'latest platform rate';
  select * into r from public.kd_fx_rate(c, 'EUR', current_date - 3);
  assert r.rate = 0.9, 'rate on or before the day';
  insert into public.fx_rates (company_id, currency, rate, as_of) values (c, 'EUR', 0.97, current_date - 4);
  select * into r from public.kd_fx_rate(c, 'EUR', current_date);
  assert r.rate = 0.95, 'newer platform rate beats an older company rate';
  insert into public.fx_rates (company_id, currency, rate, as_of) values (c, 'EUR', 0.99, current_date - 2);
  select * into r from public.kd_fx_rate(c, 'EUR', current_date);
  assert r.rate = 0.99, 'on the same day the company rate wins';
  select * into r from public.kd_fx_rate(c2, 'EUR', current_date);
  assert r.rate = 0.95, 'another company never sees it';
  assert not exists (select 1 from public.kd_fx_rate(c, 'JPY', current_date)), 'no rate means no row';
end
$$;
