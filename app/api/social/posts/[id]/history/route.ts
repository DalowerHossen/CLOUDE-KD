// path: app/api/social/posts/[id]/history/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { historyOf } from '@/services/social/approvals';

export const GET = withApi(
  {
    id: 'social.posts.history',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await historyOf(actor.companyId, params.id) };
  },
);
