// path: app/api/social/posts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { postUpdate } from '@/lib/social/rules';
import { getPost, updatePost } from '@/services/social/posts';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'social.posts.get',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getPost(actor.companyId, p.id) };
  },
);

export const PATCH = withApi(
  {
    id: 'social.posts.update',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_post' },
    params,
    body: postUpdate,
    auditExempt: 'The post service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await updatePost(actor, p.id, body) };
  },
);
