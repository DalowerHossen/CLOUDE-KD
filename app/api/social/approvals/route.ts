// path: app/api/social/approvals/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listPending } from '@/services/social/approvals';

/** The posts that wait for a decision. */
export const GET = withApi(
  {
    id: 'social.approvals.list',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_post' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPending(actor.companyId) };
  },
);
