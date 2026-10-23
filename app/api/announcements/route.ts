// path: app/api/announcements/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listLive } from '@/services/company/announcements';

export const GET = withApi(
  {
    id: 'announcements.live',
    scope: 'tenant',
    permission: { action: 'announcement.read', resourceType: 'announcement' },
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listLive(actor.role) };
  },
);
