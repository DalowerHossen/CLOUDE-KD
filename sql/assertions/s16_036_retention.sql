-- path: sql/assertions/s16_036_retention.sql
-- Offers and surveys accept only the known triggers, reasons and outcomes; a coupon code has the coupon shape; a survey can point
-- to an offer; both tables are closed to clients.
do $$
declare
  u uuid := gen_random_uuid();
  o uuid;
  c uuid;
begin
  insert into public.retention_offers (trigger_kind, reason_code, title, message, coupon_code, created_by)
    values ('cancel', 'too_expensive', 'Stay for 50 percent off', 'Take half off for three months.', 'STAY-50', u) returning id into o;
  insert into public.retention_offers (trigger_kind, title, message, created_by) values ('downgrade', 'Keep your plan', 'Tell us what is missing and we will help.', u);
  begin insert into public.retention_offers (trigger_kind, title, message, created_by) values ('pause', 'Unknown trigger', 'Triggers are fixed.', u); assert false, 'known triggers';
  exception when check_violation then null; end;
  begin insert into public.retention_offers (trigger_kind, reason_code, title, message, created_by) values ('cancel', 'rude', 'Unknown reason', 'Reasons are fixed.', u); assert false, 'known reasons';
  exception when check_violation then null; end;
  begin insert into public.retention_offers (trigger_kind, title, message, coupon_code, created_by) values ('cancel', 'Bad code', 'A coupon code has a shape.', 'stay 50!', u); assert false, 'coupon shape';
  exception when check_violation then null; end;
  select id into c from public.companies where deleted_at is null limit 1;
  if c is not null then
    insert into public.exit_surveys (company_id, user_id, trigger_kind, reason_code, detail, offer_id, outcome) values (c, u, 'cancel', 'too_expensive', 'Too much for us', o, 'saved');
    begin insert into public.exit_surveys (company_id, user_id, trigger_kind, reason_code, outcome) values (c, u, 'cancel', 'too_expensive', 'maybe'); assert false, 'known outcomes';
    exception when check_violation then null; end;
    begin insert into public.exit_surveys (company_id, user_id, trigger_kind, reason_code, detail, outcome) values (c, u, 'cancel', 'other', repeat('x', 501), 'continued'); assert false, 'detail length';
    exception when check_violation then null; end;
  end if;
  assert not has_table_privilege('authenticated', 'public.retention_offers', 'select'), 'offers closed';
  assert not has_table_privilege('authenticated', 'public.exit_surveys', 'select'), 'surveys closed';
end $$;
