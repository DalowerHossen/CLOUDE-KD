// path: app/api/admin/fraud/actions/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { fraudActionSchema, runFraudAction } from '@/services/fraud/admin-ops';

export const POST = withApi(
  {
    id: 'admin.fraud.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'fraud.manage', resourceType: 'fraud' },
    stepUp: { maxAgeSeconds: 300 },
    body: fraudActionSchema,
    auditExempt: 'The fraud service writes the audit entry.',
  },
  async ({ body, actor }) => {
    if (!actor) throw new ForbiddenError();
    await runFraudAction(actor, body);
    return { data: { done: true } };
  },
);
