// path: app/api/export/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { exportSchema } from '@/lib/transfer/mapping';
import { exportList } from '@/services/export/exports';

export const POST = withApi(
  {
    id: 'export.create',
    scope: 'tenant',
    permission: { action: 'list.export', resourceType: 'export' },
    body: exportSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The export service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await exportList(actor, body) };
  },
);
