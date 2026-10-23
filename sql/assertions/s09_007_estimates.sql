-- path: sql/assertions/s09_007_estimates.sql
-- Estimates: numbering, a sent estimate is fixed, a decision is final and happens once, expiry, signature record.
do $$
declare
  c uuid; e uuid; e2 uuid; num text; num2 text; r text; n integer;
  inp jsonb := '{"lines":[{"description":"x"}]}';
begin
  insert into public.companies (name, slug) values ('Est Co', 'est-co') returning id into c;
  insert into public.estimates (company_id, walk_in_name, input, total, valid_until) values (c, 'Wendy', inp, 100, current_date + 30) returning id into e;
  insert into public.estimates (company_id, walk_in_name, input, total, valid_until) values (c, 'Walt', inp, 50, current_date + 30) returning id into e2;
  -- an empty estimate cannot be sent
  insert into public.estimates (company_id, walk_in_name, input, valid_until) values (c, 'Empty', '{"lines":[]}', current_date + 5);
  num := public.kd_estimate_send(c, e, 'EST-', false, 5, 1, 2026, '{"name":"Seller"}', null);
  num2 := public.kd_estimate_send(c, e2, 'EST-', false, 5, 1, 2026, '{"name":"Seller"}', null);
  assert num = 'EST-00001' and num2 = 'EST-00002', 'numbers follow each other without gaps';
  begin perform public.kd_estimate_send(c, e, 'EST-', false, 5, 1, 2026, '{}', null); assert false, 'cannot send twice';
  exception when invalid_parameter_value then null; end;
  begin update public.estimates set total = 1 where id = e; assert false, 'sent estimate is fixed';
  exception when insufficient_privilege then null; end;
  begin update public.estimates set number = 'X-1' where id = e; assert false, 'number is fixed';
  exception when insufficient_privilege then null; end;
  r := public.kd_estimate_decide(e, 'accepted', 'Wendy W', '203.0.113.9', 'agent', 'ok', repeat('c', 64));
  assert r = 'accepted', 'accepted';
  begin perform public.kd_estimate_decide(e, 'declined', 'Wendy W', '', '', '', repeat('d', 64)); assert false, 'decision once';
  exception when invalid_parameter_value then null; end;
  begin update public.estimates set signer_name = 'Someone else' where id = e; assert false, 'decision is final';
  exception when insufficient_privilege then null; end;
  begin update public.estimates set status = 'draft' where id = e; assert false, 'decided estimate cannot go back to draft';
  exception when insufficient_privilege then null; end;
  -- expiry
  set local session_replication_role = replica;
  update public.estimates set valid_until = current_date - 1 where id = e2;
  set local session_replication_role = origin;
  n := public.kd_estimate_expire(current_date);
  assert n = 1, 'one estimate expired';
  assert (select status from public.estimates where id = e2) = 'expired', 'status expired';
  begin perform public.kd_estimate_decide(e2, 'accepted', 'x', '', '', '', repeat('e', 64)); assert false, 'expired cannot be decided';
  exception when invalid_parameter_value then null; end;
  -- events are append only
  insert into public.estimate_events (company_id, estimate_id, kind) values (c, e, 'sent');
  begin delete from public.estimate_events where estimate_id = e; assert false, 'events append only';
  exception when insufficient_privilege then null; end;
end $$;
