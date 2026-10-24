// path: app/api/reports/search/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { searchWork } from '@/services/report/search';

export const GET = withApi(
  {
    id: 'reports.search',
    scope: 'tenant',
    permission: { action: 'project.read', resourceType: 'project' },
    query: z.object({ q: z.string().trim().min(2).max(60) }).strict(),
    rateLimitPolicy: 'strict',
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await searchWork(actor, query.q) };
  },
);
