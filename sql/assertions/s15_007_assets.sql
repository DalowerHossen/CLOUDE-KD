-- path: sql/assertions/s15_007_assets.sql
-- Assets: RLS on; category accounts of the right kinds; an asset needs salvage not above cost, a service date not before the
-- purchase, units for the units method; depreciation is one row per asset and month, only from the start month, never above the
-- depreciable amount, append only; after depreciation the cost, life and method cannot change; a sold asset does not change.
do $$
declare
  c uuid; fa uuid; acc uuid; exp uuid; asset_acc uuid; cat uuid; a uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('asset_categories', 'fixed_assets', 'asset_depreciation', 'asset_usage', 'asset_documents') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Asset Co', 'asset-co') returning id into c;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1210', 'Equipment', 'asset', 'fixed_asset') returning id into fa;
  insert into public.accounts (company_id, code, name, type, subtype, is_contra) values (c, '1290', 'Accumulated depreciation', 'asset', 'fixed_asset', true) returning id into acc;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '6300', 'Depreciation', 'expense', 'operating_expense') returning id into exp;
  insert into public.accounts (company_id, code, name, type, subtype) values (c, '1111', 'Plain asset', 'asset', 'current_asset') returning id into asset_acc;
  begin insert into public.asset_categories (company_id, name, accumulated_account_id) values (c, 'Bad', asset_acc); assert false, 'accumulated must be contra';
  exception when invalid_parameter_value then null; end;
  begin insert into public.asset_categories (company_id, name, expense_account_id) values (c, 'Bad', fa); assert false, 'expense account kind';
  exception when invalid_parameter_value then null; end;
  insert into public.asset_categories (company_id, name, asset_account_id, accumulated_account_id, expense_account_id) values (c, 'Equipment', fa, acc, exp) returning id into cat;
  begin insert into public.asset_categories (company_id, name) values (c, 'equipment'); assert false, 'category name once';
  exception when unique_violation then null; end;

  begin insert into public.fixed_assets (company_id, name, category_id, purchase_date, in_service_date, cost, salvage_value, life_months, method) values (c, 'X', cat, date '2026-01-01', date '2026-01-01', 100, 200, 12, 'straight_line'); assert false, 'salvage above cost';
  exception when check_violation then null; end;
  begin insert into public.fixed_assets (company_id, name, category_id, purchase_date, in_service_date, cost, life_months, method) values (c, 'X', cat, date '2026-02-01', date '2026-01-01', 100, 12, 'straight_line'); assert false, 'service before purchase';
  exception when check_violation then null; end;
  begin insert into public.fixed_assets (company_id, name, category_id, purchase_date, in_service_date, cost, life_months, method) values (c, 'X', cat, date '2026-01-01', date '2026-01-01', 100, 12, 'units_of_production'); assert false, 'units method needs total units';
  exception when check_violation then null; end;
  insert into public.fixed_assets (company_id, name, category_id, purchase_date, in_service_date, cost, salvage_value, life_months, method, serial_number)
    values (c, 'Server', cat, date '2026-01-10', date '2026-01-10', 1200, 0, 12, 'straight_line', 'SN-1') returning id into a;

  begin insert into public.asset_depreciation (company_id, asset_id, period_month, amount) values (c, a, date '2025-12-01', 10); assert false, 'before service';
  exception when invalid_parameter_value then null; end;
  begin insert into public.asset_depreciation (company_id, asset_id, period_month, amount) values (c, a, date '2026-01-15', 10); assert false, 'month start only';
  exception when check_violation then null; end;
  insert into public.asset_depreciation (company_id, asset_id, period_month, amount) values (c, a, date '2026-01-01', 100);
  begin insert into public.asset_depreciation (company_id, asset_id, period_month, amount) values (c, a, date '2026-01-01', 100); assert false, 'one row per month';
  exception when unique_violation then null; end;
  begin insert into public.asset_depreciation (company_id, asset_id, period_month, amount) values (c, a, date '2026-02-01', 1101); assert false, 'above the depreciable amount';
  exception when check_violation then null; end;
  begin update public.asset_depreciation set amount = 1 where asset_id = a; assert false, 'append only';
  exception when insufficient_privilege then null; end;
  begin update public.fixed_assets set cost = 2000 where id = a; assert false, 'cost after depreciation';
  exception when object_not_in_prerequisite_state then null; end;
  begin update public.fixed_assets set method = 'sum_of_years' where id = a; assert false, 'method after depreciation';
  exception when object_not_in_prerequisite_state then null; end;
  update public.fixed_assets set location = 'Office', warranty_until = date '2028-01-01' where id = a;
  assert (select location from public.fixed_assets where id = a) = 'Office', 'place and warranty can change';
  update public.fixed_assets set status = 'sold', disposed_on = date '2026-06-30', disposal_proceeds = 500, disposal_gain_loss = 100 where id = a;
  begin update public.fixed_assets set status = 'active', disposed_on = null where id = a; assert false, 'a sold asset';
  exception when object_not_in_prerequisite_state then null; end;
  begin insert into public.fixed_assets (company_id, name, category_id, purchase_date, in_service_date, cost, life_months, method, status) values (c, 'Y', cat, date '2026-01-01', date '2026-01-01', 10, 12, 'straight_line', 'sold'); assert false, 'sold needs a date';
  exception when check_violation then null; end;
  insert into public.asset_usage (company_id, asset_id, period_month, units) values (c, a, date '2026-02-01', 40);
  begin insert into public.asset_usage (company_id, asset_id, period_month, units) values (c, a, date '2026-02-01', 41); assert false, 'one usage row per month';
  exception when unique_violation then null; end;
end
$$;
