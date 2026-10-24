// path: app/api/migration/jobs/[id]/rollback/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { MIGRATION_STEP_UP_SECONDS } from '@/config/s16-migration';
import { ForbiddenError } from '@/lib/errors';
import { startRollback } from '@/services/migration/runner';

/** Removes the records this import created, within 24 hours of the end of the import. Needs a fresh identity check. */
export const POST = withApi(
  {
    id: 'migration.jobs.rollback',
    scope: 'tenant',
    permission: { action: 'migration.manage', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    stepUp: { maxAgeSeconds: MIGRATION_STEP_UP_SECONDS },
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await startRollback(actor, params.id) };
  },
);
