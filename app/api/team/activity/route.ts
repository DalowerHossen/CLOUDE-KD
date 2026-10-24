// path: app/api/team/activity/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { listMembers, memberActivity } from '@/services/team/members';

export const GET = withApi(
  {
    id: 'team.activity',
    scope: 'tenant',
    permission: { action: 'team.read', resourceType: 'team' },
    query: z.object({ userId: z.string().uuid() }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const members = await listMembers(actor.companyId);
    if (!members.some((m) => m.userId === query.userId)) throw new NotFoundError();
    return { data: await memberActivity(actor.companyId, query.userId) };
  },
);
