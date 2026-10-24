// path: app/api/cms/save/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cmsSaveSchema, runCmsAction } from '@/services/cms/cms-service';

export const POST = withApi(
  {
    id: 'cms.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'cms.edit', resourceType: 'cms' },
    query: z.object({ kind: z.enum(['page', 'legal', 'help']).default('page') }).strict(),
    maxBodyBytes: 600_000,
    body: cmsSaveSchema,
    auditExempt: 'The CMS service writes the audit entry.',
  },
  async ({ actor, body, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runCmsAction(actor, query.kind, body) };
  },
);
