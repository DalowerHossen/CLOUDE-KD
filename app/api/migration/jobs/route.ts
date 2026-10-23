// path: app/api/migration/jobs/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { uploadInput } from '@/lib/migration/rules';
import { createJob, listJobs } from '@/services/migration/jobs';

/** The history of imports from other tools. */
export const GET = withApi(
  {
    id: 'migration.jobs.list',
    scope: 'tenant',
    permission: { action: 'migration.read', resourceType: 'migration_job' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listJobs(actor.companyId) };
  },
);

/** Uploads the file (as base64) and makes a job. Nothing is written to the lists yet. */
export const POST = withApi(
  {
    id: 'migration.jobs.create',
    scope: 'tenant',
    permission: { action: 'migration.manage', resourceType: 'migration_job' },
    body: uploadInput,
    idempotent: true,
    auditExempt: 'The migration service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createJob(actor, body) };
  },
);
