// path: app/api/admin/compliance/retention/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retentionUpsertSchema, upsertRetention } from '@/services/compliance/queries';

export const PUT = withApi(
  {
    id: 'admin.compliance.retention.put',
    scope: 'platform',
    roles: ['super_admin', 'ceo'],
    networkContext: 'admin',
    permission: { action: 'compliance.manage', resourceType: 'retention_policy' },
    stepUp: { maxAgeSeconds: 600 },
    body: retentionUpsertSchema,
    auditExempt: 'The compliance service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await upsertRetention(actor, body) };
  },
);
