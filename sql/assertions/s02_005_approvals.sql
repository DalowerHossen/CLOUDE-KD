-- path: sql/assertions/s02_005_approvals.sql
-- Approval chain rules: levels, self-approval, dual approval, delegation, escalation, tenant isolation, solo mode.
do $$
declare
  ca uuid := public.uuid_generate_v7();
  cb uuid := public.uuid_generate_v7();
  staff uuid := public.uuid_generate_v7();
  owner_a uuid := public.uuid_generate_v7();
  owner_b uuid := public.uuid_generate_v7();
  ceo uuid := public.uuid_generate_v7();
  sup uuid := public.uuid_generate_v7();
  sup2 uuid := public.uuid_generate_v7();
  deleg uuid := public.uuid_generate_v7();
  rid uuid; res jsonb; n int;
begin
  insert into public.companies (id, name, slug) values (ca, 'A', 'ap-a'), (cb, 'B', 'ap-b');

  -- L0: approved immediately
  rid := public.kd_approval_create(ca, 'note.create', '{}', owner_a, 'owner', 'L0', 24);
  assert (select status from public.approval_requests where id = rid) = 'approved', 'L0 auto approved';

  -- staff request with L2: owner step first, then CEO
  rid := public.kd_approval_create(ca, 'invoice.void', '{"ref":"x"}', staff, 'staff', 'L2', 24, true);
  assert (select count(*) from public.approval_steps where request_id = rid) = 2, 'staff request gets an owner step';
  begin perform public.kd_approval_decide(rid, staff, 'staff', ca, 'approve', null); assert false, 'staff cannot decide';
  exception when sqlstate '42501' then null; end;
  begin perform public.kd_approval_decide(rid, owner_b, 'owner', cb, 'approve', null); assert false, 'foreign owner sees nothing';
  exception when sqlstate '02000' then null; end;
  res := public.kd_approval_decide(rid, owner_a, 'owner', ca, 'approve', null);
  assert res ->> 'currentLevel' = 'L2' and res ->> 'status' = 'pending', 'moves to CEO level';
  begin perform public.kd_approval_decide(rid, owner_a, 'owner', ca, 'approve', null); assert false, 'owner cannot decide L2';
  exception when sqlstate '42501' then null; end;
  res := public.kd_approval_decide(rid, ceo, 'ceo', null, 'approve', null);
  assert res ->> 'status' = 'approved', 'CEO completes the chain';
  begin perform public.kd_approval_decide(rid, ceo, 'ceo', null, 'approve', null); assert false, 'closed request';
  exception when sqlstate '55000' then null; end;

  -- self approval rejected
  rid := public.kd_approval_create(null, 'flags.manage', '{}', sup, 'super_admin', 'L3', 24);
  begin perform public.kd_approval_decide(rid, sup, 'super_admin', null, 'approve', null); assert false, 'self approval must fail';
  exception when sqlstate '42501' then null; end;
  res := public.kd_approval_decide(rid, sup2, 'super_admin', null, 'approve', null);
  assert res ->> 'status' = 'approved', 'a second super_admin approves';

  -- solo mode lets a super_admin approve own request
  insert into public.feature_flags (key, enabled) values ('approval.solo_mode', true);
  rid := public.kd_approval_create(null, 'flags.manage', '{}', sup, 'super_admin', 'L3', 24);
  res := public.kd_approval_decide(rid, sup, 'super_admin', null, 'approve', null);
  assert res ->> 'status' = 'approved', 'solo mode allows self approval';
  rid := public.kd_approval_create(ca, 'invoice.void', '{}', ceo, 'ceo', 'L2', 24);
  begin perform public.kd_approval_decide(rid, ceo, 'ceo', null, 'approve', null); assert false, 'solo mode is for super_admin only';
  exception when sqlstate '42501' then null; end;
  update public.feature_flags set enabled = false where key = 'approval.solo_mode';

  -- dual approval needs two different people
  rid := public.kd_approval_create(null, 'payout.large', '{}', owner_a, 'owner', 'L2+L3', 24);
  assert (select count(*) from public.approval_steps where request_id = rid) = 2, 'dual has two steps';
  res := public.kd_approval_decide(rid, sup, 'super_admin', null, 'approve', null);
  begin perform public.kd_approval_decide(rid, sup, 'super_admin', null, 'approve', null); assert false, 'same person twice';
  exception when sqlstate '42501' then null; end;
  res := public.kd_approval_decide(rid, sup2, 'super_admin', null, 'approve', null);
  assert res ->> 'status' = 'approved', 'dual completes with two people';

  -- rejection needs a reason and closes the request
  rid := public.kd_approval_create(ca, 'invoice.void', '{}', staff, 'staff', 'L1', 24);
  begin perform public.kd_approval_decide(rid, owner_a, 'owner', ca, 'reject', ''); assert false, 'reason required';
  exception when sqlstate '22023' then null; end;
  res := public.kd_approval_decide(rid, owner_a, 'owner', ca, 'reject', 'not needed');
  assert res ->> 'status' = 'rejected', 'rejected';

  -- delegation
  rid := public.kd_approval_create(ca, 'invoice.void', '{}', staff, 'staff', 'L1', 24);
  begin perform public.kd_approval_decide(rid, deleg, 'owner', ca, 'approve', null, owner_a, 'owner'); assert false, 'no delegation yet';
  exception when sqlstate '42501' then null; end;
  insert into public.approval_delegations (company_id, delegator_id, delegator_role, delegate_id, ends_at)
  values (ca, owner_a, 'owner', deleg, now() + interval '1 day');
  res := public.kd_approval_decide(rid, deleg, 'staff', ca, 'approve', null, owner_a, 'owner');
  assert res ->> 'status' = 'approved', 'delegate decides for the owner';
  assert (select acted_for from public.approval_steps where request_id = rid and status = 'approved') = owner_a, 'acted_for recorded';

  -- escalation after the SLA
  rid := public.kd_approval_create(ca, 'invoice.void', '{}', staff, 'staff', 'L1', 1);
  update public.approval_steps set sla_due_at = now() - interval '1 minute' where request_id = rid;
  n := public.kd_approval_escalate();
  assert n >= 1, 'escalated';
  assert (select current_level from public.approval_requests where id = rid) = 'L2', 'escalated to L2';
  update public.approval_steps set sla_due_at = now() - interval '1 minute' where request_id = rid and status = 'pending';
  perform public.kd_approval_escalate();
  update public.approval_steps set sla_due_at = now() - interval '1 minute' where request_id = rid and status = 'pending';
  perform public.kd_approval_escalate();
  assert (select status from public.approval_requests where id = rid) = 'expired', 'expires after L3';

  -- RLS: tenant B cannot read tenant A requests
  perform set_config('request.jwt.claims', json_build_object('sub', owner_b, 'app_metadata', json_build_object('company_id', cb, 'role', 'owner'))::text, true);
  set local role authenticated;
  select count(*) into n from public.approval_requests; assert n = 0, 'no cross-tenant read';
  select count(*) into n from public.approval_steps; assert n = 0, 'no cross-tenant step read';
  begin insert into public.approval_requests (company_id, action, requester_id, requester_role, required_level, current_level)
    values (cb, 'a.b', owner_b, 'owner', 'L0', 'L0'); assert false, 'clients cannot write requests';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
