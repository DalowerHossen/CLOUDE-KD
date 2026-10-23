// path: app/api/migration/jobs/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getJob } from '@/services/migration/jobs';

export const GET = withApi(
  {
    id: 'migration.jobs.get',
    scope: 'tenant',
    permission: { action: 'migration.read', resourceType: 'migration_job' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getJob(actor.companyId, params.id) };
  },
);
