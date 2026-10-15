// path: workers/runner.ts
// One worker tick: deliver due domain events, then run due jobs. Called by the cron entry (worker-tick) and by the
// standalone worker process on Docker/VPS (node --import tsx workers/runner.ts loops this function).
import 'server-only';
import { dispatchEvents, dispatchJobs, type DispatchSummary } from '@/services/jobs/dispatcher';

export interface TickOptions {
  worker?: string;
  eventLimit?: number;
  jobLimit?: number;
}

export async function runWorkerTick(options: TickOptions = {}): Promise<DispatchSummary> {
  const worker = options.worker ?? `tick-${process.pid}`;
  const events = await dispatchEvents(worker, options.eventLimit ?? 25);
  const jobs = await dispatchJobs(worker, options.jobLimit ?? 25);
  return { events, jobs };
}
