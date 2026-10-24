// path: app/api/cms/pages/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { listPages } from '@/services/cms/cms-service';

export const GET = withApi(
  {
    id: 'cms.pages.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'cms.read', resourceType: 'cms' },
    query: z.object({ kind: z.enum(['page', 'legal', 'help']).default('page') }).strict(),
  },
  async ({ query }) => ({ data: await listPages(query.kind) }),
);
