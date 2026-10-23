// path: services/jobs/dispatcher.ts
// Claims due events and jobs (FOR UPDATE SKIP LOCKED in the database) and runs the registered handlers.
import 'server-only';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { runWithContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { newCorrelationId } from '@/lib/logger/correlation';
import type { DomainEvent, DomainEventName } from '@/types/events';
import { eventHandlers, jobHandlers } from './handlers.generated';
import type { EventHandlerDefinition, JobHandlerDefinition } from './handler-types';

const log = createLogger({ component: 'dispatcher' });

const eventRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    name: z.string(),
    payload: z.record(z.unknown()),
    correlation_id: z.string().nullable(),
    occurred_at: z.string(),
  })
  .strip();
const jobRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    name: z.string(),
    payload: z.record(z.unknown()),
    attempts: z.number().int(),
  })
  .strip();

export interface DispatchSummary {
  events: { claimed: number; done: number; failed: number };
  jobs: { claimed: number; done: number; failed: number };
}

const message = (error: unknown): string =>
  (error instanceof Error ? error.message : 'handler failed').slice(0, 500);

export async function dispatchEvents(
  worker: string,
  limit: number,
  handlers: readonly EventHandlerDefinition[] = eventHandlers,
): Promise<DispatchSummary['events']> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_claim_events', {
    p_limit: limit,
    p_worker: worker,
    p_lock_seconds: 60,
  });
  if (error) throw new InternalError(error);
  const rows = z.array(eventRow).parse(data);
  const summary = { claimed: rows.length, done: 0, failed: 0 };
  for (const row of rows) {
    const event: DomainEvent = {
      id: row.id,
      name: row.name as DomainEventName,
      companyId: row.company_id,
      occurredAt: row.occurred_at,
      correlationId: row.correlation_id ?? row.id,
      payload: row.payload,
    };
    const matching = handlers.filter((h) => h.events.includes(event.name));
    try {
      await runWithContext(
        { correlationId: event.correlationId, companyId: event.companyId },
        async () => {
          for (const handler of matching) await handler.handle(event);
        },
      );
      await admin.rpc('kd_finish_event', { p_id: row.id, p_ok: true });
      summary.done += 1;
    } catch (failure) {
      log.error('event handler failed', { event: event.name, id: row.id, error: failure });
      await admin.rpc('kd_finish_event', { p_id: row.id, p_ok: false, p_error: message(failure) });
      summary.failed += 1;
    }
  }
  return summary;
}

export async function dispatchJobs(
  worker: string,
  limit: number,
  handlers: readonly JobHandlerDefinition[] = jobHandlers,
): Promise<DispatchSummary['jobs']> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_claim_jobs', {
    p_limit: limit,
    p_worker: worker,
    p_lock_seconds: 120,
  });
  if (error) throw new InternalError(error);
  const rows = z.array(jobRow).parse(data);
  const summary = { claimed: rows.length, done: 0, failed: 0 };
  for (const row of rows) {
    const handler = handlers.find((h) => h.name === row.name);
    try {
      if (!handler) throw new Error(`No handler registered for job ${row.name}`);
      await runWithContext({ correlationId: newCorrelationId(), companyId: row.company_id }, () =>
        handler.handle(row.payload, {
          jobId: row.id,
          attempt: row.attempts,
          companyId: row.company_id,
        }),
      );
      await admin.rpc('kd_finish_job', { p_id: row.id, p_ok: true });
      summary.done += 1;
    } catch (failure) {
      log.error('job failed', { job: row.name, id: row.id, error: failure });
      await admin.rpc('kd_finish_job', { p_id: row.id, p_ok: false, p_error: message(failure) });
      summary.failed += 1;
    }
  }
  return summary;
}
