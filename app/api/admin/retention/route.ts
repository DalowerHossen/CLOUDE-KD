// path: app/api/admin/retention/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { offerActionSchema } from '@/lib/platform/retention';
import { runOfferAction } from '@/services/platform/retention';

export const POST = withApi(
  {
    id: 'admin.retention.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'retention.manage', resourceType: 'retention_offer' },
    stepUp: { maxAgeSeconds: 300 },
    body: offerActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await runOfferAction(actor, body);
    return { data: { done: true } };
  },
);
