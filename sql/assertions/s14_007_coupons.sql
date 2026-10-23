-- path: sql/assertions/s14_007_coupons.sql
-- Coupons: RLS on, the kind decides which value is set, codes are upper case and unique, and the redemption function
-- refuses a second use of a one-time coupon, a coupon that is disabled, expired, not started, for another plan, or used up.
do $$
declare
  a uuid; b uuid; c uuid; cp uuid; r jsonb; n integer;
begin
  select count(*) into n from pg_class x join pg_namespace s on s.oid = x.relnamespace
    where s.nspname = 'public' and x.relname in ('coupons', 'coupon_redemptions', 'coupon_attempts') and not x.relrowsecurity;
  assert n = 0, 'RLS must be on';
  insert into public.companies (name, slug) values ('Coupon A', 'coupon-a') returning id into a;
  insert into public.companies (name, slug) values ('Coupon B', 'coupon-b') returning id into b;
  insert into public.companies (name, slug) values ('Coupon C', 'coupon-c') returning id into c;

  insert into public.coupons (code, name, kind, percent_off, max_redemptions) values ('SAVE20', 'Save 20', 'percent', 20, 2) returning id into cp;
  begin insert into public.coupons (code, name, kind, percent_off) values ('SAVE20', 'Again', 'percent', 10); assert false, 'code twice';
  exception when unique_violation then null; end;
  begin insert into public.coupons (code, name, kind, percent_off) values ('lower', 'x', 'percent', 10); assert false, 'code must be upper case';
  exception when check_violation then null; end;
  begin insert into public.coupons (code, name, kind, amount_off) values ('BADKIND', 'x', 'percent', 5); assert false, 'percent needs percent_off';
  exception when check_violation then null; end;
  begin insert into public.coupons (code, name, kind, percent_off) values ('OVER100', 'x', 'percent', 120); assert false, 'over 100 percent';
  exception when check_violation then null; end;

  r := public.kd_coupon_redeem(' save20 ', a, null, 'pro');
  assert (r->>'ok')::boolean and (r->>'kind') = 'percent', 'first use works, code is trimmed and upper-cased';
  r := public.kd_coupon_redeem('SAVE20', a, null, 'pro');
  assert not (r->>'ok')::boolean and r->>'error' = 'already_used', 'one-time per company';
  r := public.kd_coupon_redeem('SAVE20', b, null, 'pro');
  assert (r->>'ok')::boolean, 'second company works';
  r := public.kd_coupon_redeem('SAVE20', c, null, 'pro');
  assert not (r->>'ok')::boolean and r->>'error' = 'used_up', 'total limit';
  r := public.kd_coupon_redeem('NOPE', c, null, 'pro');
  assert r->>'error' = 'invalid', 'unknown code';

  insert into public.coupons (code, name, kind, amount_off, plan_slugs) values ('ONLYBIZ', 'Business only', 'fixed', 10, array['business']);
  assert public.kd_coupon_redeem('ONLYBIZ', a, null, 'pro')->>'error' = 'wrong_plan', 'plan restriction';
  assert (public.kd_coupon_redeem('ONLYBIZ', a, null, 'business')->>'ok')::boolean, 'right plan';
  insert into public.coupons (code, name, kind, trial_days, enabled) values ('OFFCODE', 'Off', 'free_trial', 30, false);
  assert public.kd_coupon_redeem('OFFCODE', c, null, 'pro')->>'error' = 'disabled', 'disabled';
  insert into public.coupons (code, name, kind, trial_days, expires_at) values ('OLDCODE', 'Old', 'free_trial', 30, now() - interval '1 day');
  assert public.kd_coupon_redeem('OLDCODE', c, null, 'pro')->>'error' = 'expired', 'expired';
  insert into public.coupons (code, name, kind, trial_days, starts_at) values ('SOONCODE', 'Soon', 'free_trial', 30, now() + interval '1 day');
  assert public.kd_coupon_redeem('SOONCODE', c, null, 'pro')->>'error' = 'not_started', 'not started';
  insert into public.coupons (code, name, kind, trial_days, once_per_company) values ('MANYUSE', 'Many', 'free_trial', 7, false);
  assert (public.kd_coupon_redeem('MANYUSE', c, null, 'pro')->>'ok')::boolean and (public.kd_coupon_redeem('MANYUSE', c, null, 'pro')->>'ok')::boolean, 'repeatable coupon';
end
$$;
