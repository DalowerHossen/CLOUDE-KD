// path: app/api/social/posts/[id]/publish/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { publishPost } from '@/services/social/posts';

/** Publishes the post now. A network that needs a short wait (Threads) answers with the post still publishing. */
export const POST = withApi(
  {
    id: 'social.posts.publish',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The post service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await publishPost(actor.companyId, params.id, actor.userId) };
  },
);
