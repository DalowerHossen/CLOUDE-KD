// path: app/api/blog/action/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { runPostAction } from '@/services/blog/admin';
import { postActionSchema } from '@/services/blog/schemas';

export const POST = withApi(
  {
    id: 'blog.post.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'blog.publish', resourceType: 'blog' },
    stepUp: { maxAgeSeconds: 300 },
    body: postActionSchema,
    auditExempt: 'The blog service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runPostAction(actor, body) };
  },
);
