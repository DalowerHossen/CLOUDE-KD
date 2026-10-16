// path: cron/schedule.generated.ts
// GENERATED - do not edit. Source: cron/jobs/sNN-*.ts (run: npm run gen)

import type { CronJobDefinition } from '@/types/contracts';
import { job as s02ApprovalEscalation } from './jobs/s02-approval-escalation';
import { job as s02AuditIntegrity } from './jobs/s02-audit-integrity';
import { job as s02QueuePurge } from './jobs/s02-queue-purge';
import { job as s02Retention } from './jobs/s02-retention';
import { job as s02WorkerTick } from './jobs/s02-worker-tick';
import { job as s04AlertEscalation } from './jobs/s04-alert-escalation';
import { job as s04RateLimitPurge } from './jobs/s04-rate-limit-purge';
import { job as s04Siem } from './jobs/s04-siem';
import { job as s04TorList } from './jobs/s04-tor-list';
import { job as s05FileRetention } from './jobs/s05-file-retention';
import { job as s05UploadPurge } from './jobs/s05-upload-purge';

export const cronJobs: CronJobDefinition[] = [s02ApprovalEscalation, s02AuditIntegrity, s02QueuePurge, s02Retention, s02WorkerTick, s04AlertEscalation, s04RateLimitPurge, s04Siem, s04TorList, s05FileRetention, s05UploadPurge];
