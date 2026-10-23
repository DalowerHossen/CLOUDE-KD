// path: app/api/social/posts/[id]/check/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkPost } from '@/services/social/posts';

/** What is wrong with the post for its network, and whether the account is at its daily limit. Sends nothing. */
export const GET = withApi(
  {
    id: 'social.posts.check',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await checkPost(actor.companyId, params.id) };
  },
);
