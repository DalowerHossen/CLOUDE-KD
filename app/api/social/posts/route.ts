// path: app/api/social/posts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { postInput } from '@/lib/social/rules';
import { createPost, listPosts } from '@/services/social/posts';

export const GET = withApi(
  {
    id: 'social.posts.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
    query: z
      .object({
        status: z
          .enum(['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'])
          .optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listPosts(actor.companyId, {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
      }),
    };
  },
);

export const POST = withApi(
  {
    id: 'social.posts.create',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_post' },
    body: postInput,
    idempotent: true,
    auditExempt: 'The post service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createPost(actor, body) };
  },
);
