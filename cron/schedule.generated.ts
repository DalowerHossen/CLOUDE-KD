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
import { job as s05EmailPurge } from './jobs/s05-email-purge';
import { job as s05EmailQueue } from './jobs/s05-email-queue';
import { job as s05FileRetention } from './jobs/s05-file-retention';
import { job as s05NotificationDigest } from './jobs/s05-notification-digest';
import { job as s05NotificationPurge } from './jobs/s05-notification-purge';
import { job as s05StorageHealth } from './jobs/s05-storage-health';
import { job as s05StorageMigrate } from './jobs/s05-storage-migrate';
import { job as s05UploadPurge } from './jobs/s05-upload-purge';
import { job as s06Blog } from './jobs/s06-blog';
import { job as s06Cms } from './jobs/s06-cms';
import { job as s07Admin } from './jobs/s07-admin';
import { job as s07Domains } from './jobs/s07-domains';
import { job as s07Kyc } from './jobs/s07-kyc';
import { job as s07Lifecycle } from './jobs/s07-lifecycle';
import { job as s07Support } from './jobs/s07-support';
import { job as s08Clients } from './jobs/s08-clients';
import { job as s08Inventory } from './jobs/s08-inventory';
import { job as s08Purchasing } from './jobs/s08-purchasing';
import { job as s09Fx } from './jobs/s09-fx';

export const cronJobs: CronJobDefinition[] = [s02ApprovalEscalation, s02AuditIntegrity, s02QueuePurge, s02Retention, s02WorkerTick, s04AlertEscalation, s04RateLimitPurge, s04Siem, s04TorList, s05EmailPurge, s05EmailQueue, s05FileRetention, s05NotificationDigest, s05NotificationPurge, s05StorageHealth, s05StorageMigrate, s05UploadPurge, s06Blog, s06Cms, s07Admin, s07Domains, s07Kyc, s07Lifecycle, s07Support, s08Clients, s08Inventory, s08Purchasing, s09Fx];
