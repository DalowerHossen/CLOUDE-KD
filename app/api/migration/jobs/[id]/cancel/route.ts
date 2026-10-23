// path: app/api/migration/jobs/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelJob } from '@/services/migration/jobs';

export const POST = withApi(
  {
    id: 'migration.jobs.cancel',
    scope: 'tenant',
    permission: { action: 'migration.manage', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cancelJob(actor, params.id) };
  },
);
