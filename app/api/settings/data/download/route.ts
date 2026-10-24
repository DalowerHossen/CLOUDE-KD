// path: app/api/settings/data/download/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { downloadLink, downloadSchema } from '@/services/lifecycle/data';

export const GET = withApi(
  {
    id: 'data.download',
    scope: 'tenant',
    permission: { action: 'data.manage', resourceType: 'data' },
    stepUp: { maxAgeSeconds: 300 },
    query: downloadSchema,
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await downloadLink(actor, query.id) };
  },
);
