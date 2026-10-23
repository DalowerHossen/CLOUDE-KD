-- path: sql/assertions/s14_009_bnpl.sql
-- Installment plans: RLS on, one platform settings row and one row per company, terms limited to known values, one live plan
-- per invoice (a cancelled one can be replaced), a completed plan has its time, the fee never exceeds the amount, the history
-- cannot be changed.
do $$
declare
  c uuid; i uuid; p uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace sc on sc.oid = x.relnamespace
    where sc.nspname = 'public' and x.relname in ('bnpl_settings', 'bnpl_plans', 'bnpl_events') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.bnpl_settings (enabled, terms) values (true, array[3, 6, 12]);
  begin insert into public.bnpl_settings (enabled) values (false); assert false, 'two platform rows';
  exception when unique_violation then null; end;
  insert into public.companies (name, slug) values ('Later Co', 'later-co') returning id into c;
  begin insert into public.bnpl_settings (company_id, terms) values (c, array[5]); assert false, 'unknown term';
  exception when check_violation then null; end;
  begin insert into public.bnpl_settings (company_id, terms) values (c, array[]::integer[]); assert false, 'at least one term';
  exception when check_violation then null; end;
  insert into public.bnpl_settings (company_id, enabled, terms, fee_percent_by_term) values (c, true, array[3, 6], '{"3":"0","6":"2"}'::jsonb);

  insert into public.invoices (company_id, walk_in_name) values (c, 'Walk In') returning id into i;
  insert into public.bnpl_plans (company_id, invoice_id, terms, principal, seller_fee_percent, seller_fee) values (c, i, 3, 300, 2, 6) returning id into p;
  begin insert into public.bnpl_plans (company_id, invoice_id, terms, principal) values (c, i, 6, 300); assert false, 'two live plans for one invoice';
  exception when unique_violation then null; end;
  begin insert into public.bnpl_plans (company_id, invoice_id, terms, principal, seller_fee) values (c, gen_random_uuid(), 3, 10, 20); assert false, 'fee above amount';
  exception when check_violation or foreign_key_violation then null; end;
  begin update public.bnpl_plans set status = 'completed' where id = p; assert false, 'completed needs its time';
  exception when check_violation then null; end;
  update public.bnpl_plans set status = 'cancelled' where id = p;
  insert into public.bnpl_plans (company_id, invoice_id, terms, principal) values (c, i, 6, 300);

  insert into public.bnpl_events (company_id, plan_id, event) values (c, p, 'accepted');
  begin update public.bnpl_events set event = 'x' where plan_id = p; assert false, 'history changed';
  exception when others then if sqlstate = 'P0004' then raise; end if; end;
end
$$;
