// path: app/api/social/hashtags/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { hashtagGroupInput } from '@/lib/social/rules';
import { createGroup, listGroups } from '@/services/social/hashtags';

export const GET = withApi(
  {
    id: 'social.hashtags.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_hashtag_group' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listGroups(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'social.hashtags.create',
    scope: 'tenant',
    permission: { action: 'social.post', resourceType: 'social_hashtag_group' },
    body: hashtagGroupInput,
    idempotent: true,
    auditExempt: 'The hashtag service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createGroup(actor, body) };
  },
);
