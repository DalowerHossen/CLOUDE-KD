// path: app/api/cms/publish/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cmsPublishSchema, runCmsAction } from '@/services/cms/cms-service';

export const POST = withApi(
  {
    id: 'cms.publish',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'cms.publish', resourceType: 'cms' },
    stepUp: { maxAgeSeconds: 300 },
    query: z.object({ kind: z.enum(['page', 'legal', 'help']).default('page') }).strict(),
    body: cmsPublishSchema,
    auditExempt: 'The CMS service writes the audit entry.',
  },
  async ({ actor, body, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runCmsAction(actor, query.kind, body) };
  },
);
