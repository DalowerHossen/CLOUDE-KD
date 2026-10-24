// path: app/api/migration/jobs/[id]/rows/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listRows } from '@/services/migration/jobs';

/** What happened to each row of the file: created (with the id of the record), skipped or failed, and the rollback result. */
export const GET = withApi(
  {
    id: 'migration.jobs.rows',
    scope: 'tenant',
    permission: { action: 'migration.read', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).strict(),
  },
  async ({ actor, params, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRows(actor.companyId, params.id, query.limit) };
  },
);
