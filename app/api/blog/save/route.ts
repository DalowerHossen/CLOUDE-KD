// path: app/api/blog/save/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { savePost } from '@/services/blog/admin';
import { postSaveSchema } from '@/services/blog/schemas';

export const POST = withApi(
  {
    id: 'blog.post.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'blog.edit', resourceType: 'blog' },
    maxBodyBytes: 600_000,
    body: postSaveSchema,
    auditExempt: 'The blog service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await savePost(actor, body) };
  },
);
