-- path: sql/assertions/s02_006_events_jobs.sql
-- Outbox claiming, SKIP LOCKED, retry with backoff, dead letter, dedupe, purge, access.
do $$
declare
  eid uuid; jid uuid; jid2 uuid; n int; r text; c record;
begin
  eid := public.kd_publish_event(null, 'invoice.created', '{"a":1}', 'corr');
  select count(*) into n from public.kd_claim_events(10, 'w1'); assert n = 1, 'event claimed once';
  select count(*) into n from public.kd_claim_events(10, 'w2'); assert n = 0, 'claimed event not claimed again';
  r := public.kd_finish_event(eid, false, 'boom', 2);
  assert r = 'failed', 'first failure retries';
  update public.domain_events set next_attempt_at = now() where id = eid;
  select count(*) into n from public.kd_claim_events(10, 'w1'); assert n = 1, 'reclaimed after backoff';
  r := public.kd_finish_event(eid, false, 'boom', 2);
  assert r = 'dead', 'dead letter after max attempts';
  update public.domain_events set next_attempt_at = now() where id = eid;
  select count(*) into n from public.kd_claim_events(10, 'w1'); assert n = 0, 'dead events are not claimed';

  -- expired lock is taken over
  eid := public.kd_publish_event(null, 'invoice.sent', '{}');
  perform public.kd_claim_events(10, 'w1', 60);
  update public.domain_events set locked_until = now() - interval '1 second' where id = eid;
  select count(*) into n from public.kd_claim_events(10, 'w2'); assert n = 1, 'stale lock is taken over';
  assert public.kd_finish_event(eid, true) = 'done', 'done';

  -- jobs: dedupe, claim, retry, dead, done
  jid := public.kd_enqueue_job(null, 'email.send', '{}', now(), 2, 'k1');
  jid2 := public.kd_enqueue_job(null, 'email.send', '{}', now(), 2, 'k1');
  assert jid is not null and jid2 is null, 'dedupe key queues once';
  select count(*) into n from public.kd_claim_jobs(5, 'w1', 60, array['report.build']); assert n = 0, 'name filter';
  select count(*) into n from public.kd_claim_jobs(5, 'w1'); assert n = 1, 'job claimed';
  assert public.kd_finish_job(jid, false, 'x') = 'failed', 'job retry';
  update public.job_queue set run_at = now() where id = jid;
  perform public.kd_claim_jobs(5, 'w1');
  assert public.kd_finish_job(jid, false, 'x') = 'dead', 'job dead after max attempts';
  jid2 := public.kd_enqueue_job(null, 'email.send', '{}', now(), 2, 'k1');
  assert jid2 is not null, 'dedupe frees after dead';
  perform public.kd_claim_jobs(5, 'w1');
  assert public.kd_finish_job(jid2, true) = 'done', 'job done';
  update public.job_queue set finished_at = now() - interval '31 days' where id = jid2;
  assert public.kd_purge_queues() >= 1, 'purge removes old finished jobs';

  -- SKIP LOCKED: two claims of one job in the same transaction never overlap
  perform public.kd_enqueue_job(null, 'a.b', '{}');
  select count(*) into n from public.kd_claim_jobs(1, 'a'); assert n = 1;
  select count(*) into n from public.kd_claim_jobs(1, 'b'); assert n = 0, 'second worker gets nothing';

  -- closed to clients
  set local role authenticated;
  begin perform 1 from public.job_queue; assert false, 'authenticated cannot read queue';
  exception when insufficient_privilege then null; end;
  begin perform public.kd_publish_event(null, 'a.b', '{}'); assert false, 'authenticated cannot publish';
  exception when insufficient_privilege then null; end;
  reset role;
end
$$;
