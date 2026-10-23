// path: app/api/social/posts/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelPost } from '@/services/social/posts';

export const POST = withApi(
  {
    id: 'social.posts.cancel',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    auditExempt: 'The post service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cancelPost(actor, params.id) };
  },
);
