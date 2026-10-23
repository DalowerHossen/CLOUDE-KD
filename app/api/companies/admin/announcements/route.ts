// path: app/api/companies/admin/announcements/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { announcementActionSchema } from '@/lib/company/ops-input';
import { listAll, runAnnouncementAction } from '@/services/company/announcements';

const permission = { action: 'announcement.manage', resourceType: 'announcement' } as const;

export const GET = withApi(
  { id: 'admin.announcements.list', scope: 'platform', networkContext: 'admin', permission },
  async () => ({ data: await listAll() }),
);

export const POST = withApi(
  {
    id: 'admin.announcements.action',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    stepUp: { maxAgeSeconds: 300 },
    body: announcementActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runAnnouncementAction(actor, body) };
  },
);
