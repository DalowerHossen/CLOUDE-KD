// path: app/api/social/hashtags/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteGroup } from '@/services/social/hashtags';

export const DELETE = withApi(
  {
    id: 'social.hashtags.remove',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_hashtag_group' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The hashtag service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteGroup(actor, params.id);
    return { data: { ok: true } };
  },
);
