// path: app/api/integrations/ocr/jobs/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryJob } from '@/services/ocr/jobs';

/** Reads the receipt again. */
export const POST = withApi(
  {
    id: 'ocr.jobs.retry',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.manage', resourceType: 'ocr_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The OCR service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await retryJob(actor, params.id) };
  },
);
