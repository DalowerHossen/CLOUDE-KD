// path: app/api/admin/system/jobs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryJob } from '@/services/platform/jobs';

const retrySchema = z.object({ id: z.string().uuid() }).strict();

export const POST = withApi(
  {
    id: 'admin.system.jobs.retry',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'system.manage', resourceType: 'platform' },
    stepUp: { maxAgeSeconds: 300 },
    body: retrySchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await retryJob(actor, body.id);
    return { data: { done: true } };
  },
);
