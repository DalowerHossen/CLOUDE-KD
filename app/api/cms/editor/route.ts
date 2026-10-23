// path: app/api/cms/editor/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { editorData } from '@/services/cms/cms-service';

export const GET = withApi(
  {
    id: 'cms.editor',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'cms.read', resourceType: 'cms' },
    query: z
      .object({
        slug: z.string().max(200),
        kind: z.enum(['page', 'legal', 'help']).default('page'),
      })
      .strict(),
  },
  async ({ query, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await editorData(actor, query.slug, query.kind) };
  },
);
