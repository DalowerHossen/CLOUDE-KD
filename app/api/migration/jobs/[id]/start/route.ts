// path: app/api/migration/jobs/[id]/start/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { MIGRATION_STEP_UP_SECONDS } from '@/config/s16-migration';
import { ForbiddenError } from '@/lib/errors';
import { startInput } from '@/lib/migration/rules';
import { startJob } from '@/services/migration/jobs';

/** Starts the import after a dry run. The owner confirms the number of records that will be created. Needs a fresh identity check. */
export const POST = withApi(
  {
    id: 'migration.jobs.start',
    scope: 'tenant',
    permission: { action: 'migration.manage', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: startInput,
    idempotent: true,
    stepUp: { maxAgeSeconds: MIGRATION_STEP_UP_SECONDS },
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await startJob(actor, params.id, body) };
  },
);
