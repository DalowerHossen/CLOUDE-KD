// path: app/api/integrations/ocr/jobs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { enqueueReceipt, listJobs } from '@/services/ocr/jobs';

export const GET = withApi(
  {
    id: 'ocr.jobs.list',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.read', resourceType: 'ocr_job' },
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listJobs(actor.companyId, query.limit) };
  },
);

/** Puts one receipt in the queue now (the cron job also queues every waiting receipt by itself). */
export const POST = withApi(
  {
    id: 'ocr.jobs.create',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.manage', resourceType: 'ocr_job' },
    body: z.object({ receiptId: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The OCR service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await enqueueReceipt(actor, body.receiptId) };
  },
);
