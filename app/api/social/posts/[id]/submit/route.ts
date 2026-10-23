// path: app/api/social/posts/[id]/submit/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { submitPostAs } from '@/services/social/approvals';
import { getPost } from '@/services/social/posts';

/** Sends the post for approval. */
export const POST = withApi(
  {
    id: 'social.posts.submit',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The approval service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await submitPostAs(actor, params.id);
    return { data: await getPost(actor.companyId, params.id) };
  },
);
