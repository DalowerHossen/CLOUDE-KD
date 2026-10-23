// path: app/api/migration/jobs/[id]/validate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { validateInput } from '@/lib/migration/rules';
import { validateJob } from '@/services/migration/jobs';

/** The dry run: checks every row with the chosen mapping and saves a report. No record is written. */
export const POST = withApi(
  {
    id: 'migration.jobs.validate',
    scope: 'tenant',
    permission: { action: 'migration.manage', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: validateInput,
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await validateJob(actor, params.id, body) };
  },
);
