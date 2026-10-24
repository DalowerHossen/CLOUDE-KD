// path: app/api/blog/post/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { getPost } from '@/services/blog/admin';

export const GET = withApi(
  {
    id: 'blog.post.get',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'blog.read', resourceType: 'blog' },
    query: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await getPost(actor, query.id) };
  },
);
