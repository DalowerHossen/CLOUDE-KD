// path: app/api/analytics/summary/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { summary } from '@/services/analytics/pixels';

export const GET = withApi(
  {
    id: 'analytics.summary',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'analytics.read', resourceType: 'analytics' },
    query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict(),
  },
  async ({ query }) => ({ data: await summary(query.days) }),
);
