// path: types/contracts/jobs.ts

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** Jobs with the same dedupe key are queued once. */
  dedupeKey?: string;
}

export interface JobService {
  enqueue(name: string, payload: Record<string, unknown>, options?: EnqueueOptions): Promise<void>;
}

/** Shape of a cron fragment (cron/jobs/sNN-*.ts exports `job`). */
export interface CronJobDefinition {
  name: string;
  /** Five-field cron expression, UTC. */
  schedule: string;
  handler: () => Promise<void>;
}
