// path: app/api/social/posts/[id]/decide/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { decisionInput } from '@/lib/social/schedule';
import { decidePost } from '@/services/social/approvals';
import { getPost } from '@/services/social/posts';

/** The owner approves or refuses a post that waits. */
export const POST = withApi(
  {
    id: 'social.posts.decide',
    scope: 'tenant',
    permission: { action: 'social.approve', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: decisionInput,
    idempotent: true,
    auditExempt: 'The approval service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await decidePost(actor, params.id, body);
    return { data: await getPost(actor.companyId, params.id) };
  },
);
