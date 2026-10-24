// path: app/api/integrations/ocr/jobs/[id]/correct/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { correctionInput } from '@/lib/ocr/rules';
import { correctJob } from '@/services/ocr/jobs';

/** Corrects the fields that were read; the corrected fields go to the expense service. */
export const PATCH = withApi(
  {
    id: 'ocr.jobs.correct',
    scope: 'tenant',
    permission: { action: 'integrations.ocr.manage', resourceType: 'ocr_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: correctionInput,
    auditExempt: 'The OCR service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await correctJob(actor, params.id, body) };
  },
);
