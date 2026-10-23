-- path: sql/assertions/s14_008_client_subscriptions.sql
-- Client subscriptions: RLS on, a plan has a price above zero and a known interval, a plan name is unique per company,
-- one live subscription per client and plan, a billing cycle is claimed once, paused and ended states carry their time,
-- the history cannot be changed.
do $$
declare
  c uuid; cl uuid; p uuid; s uuid; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace sc on sc.oid = x.relnamespace
    where sc.nspname = 'public' and x.relname in ('client_subscription_plans', 'client_subscriptions', 'client_billing_runs', 'client_subscription_events') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Seller Co', 'seller-co') returning id into c;
  insert into public.clients (company_id, name) values (c, 'Buyer One') returning id into cl;

  insert into public.client_subscription_plans (company_id, name, price) values (c, 'Gold', 49) returning id into p;
  begin insert into public.client_subscription_plans (company_id, name, price) values (c, 'gold', 10); assert false, 'plan name twice';
  exception when unique_violation then null; end;
  begin insert into public.client_subscription_plans (company_id, name, price) values (c, 'Free', 0); assert false, 'price above zero';
  exception when check_violation then null; end;
  begin insert into public.client_subscription_plans (company_id, name, price, interval) values (c, 'Weekly', 5, 'week'); assert false, 'bad interval';
  exception when check_violation then null; end;
  begin insert into public.client_subscription_plans (company_id, name, price, features) values (c, 'Odd', 5, '{"a":1}'::jsonb); assert false, 'features is a list';
  exception when check_violation then null; end;

  insert into public.client_subscriptions (company_id, client_id, plan_id, interval, price, current_period_start, current_period_end, next_billing_at)
    values (c, cl, p, 'month', 49, now(), now() + interval '30 days', now()) returning id into s;
  begin insert into public.client_subscriptions (company_id, client_id, plan_id, interval, price, current_period_start, current_period_end)
      values (c, cl, p, 'month', 49, now(), now() + interval '30 days');
    assert false, 'two live subscriptions of one client on one plan';
  exception when unique_violation then null; end;
  begin update public.client_subscriptions set status = 'paused' where id = s; assert false, 'paused needs its time';
  exception when check_violation then null; end;
  begin update public.client_subscriptions set status = 'ended' where id = s; assert false, 'ended needs its time';
  exception when check_violation then null; end;
  update public.client_subscriptions set status = 'cancelled', ended_at = now() where id = s;
  -- after it ended, the client can join the plan again
  insert into public.client_subscriptions (company_id, client_id, plan_id, interval, price, current_period_start, current_period_end)
    values (c, cl, p, 'month', 49, now(), now() + interval '30 days');

  insert into public.client_billing_runs (company_id, subscription_id, period_start, period_end) values (c, s, '2026-11-01', '2026-12-01');
  begin insert into public.client_billing_runs (company_id, subscription_id, period_start, period_end) values (c, s, '2026-11-01', '2026-12-01');
    assert false, 'a cycle is claimed once';
  exception when unique_violation then null; end;
  insert into public.client_billing_runs (company_id, subscription_id, kind, period_start, period_end) values (c, s, 'upgrade', '2026-11-01', '2026-12-01');
  begin update public.client_billing_runs set status = 'invoiced' where subscription_id = s and kind = 'cycle'; assert false, 'invoiced needs an invoice';
  exception when check_violation then null; end;

  insert into public.client_subscription_events (company_id, subscription_id, event) values (c, s, 'created');
  begin update public.client_subscription_events set event = 'x' where subscription_id = s; assert false, 'history changed';
  exception when others then if sqlstate = 'P0004' then raise; end if; end;
end
$$;
