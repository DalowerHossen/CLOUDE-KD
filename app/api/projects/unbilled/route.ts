// path: app/api/projects/unbilled/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { unbilledSummary } from '@/services/project/billing';

export const GET = withApi(
  {
    id: 'projects.unbilledSummary',
    scope: 'tenant',
    permission: { action: 'project.bill', resourceType: 'project' },
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await unbilledSummary(actor) };
  },
);
