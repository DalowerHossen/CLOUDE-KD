// path: app/api/portal/bulk/estimates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { previewEstimateReminders, sendEstimateReminders } from '@/services/portal/bulk-mail';
import { bulkConfirmBody } from '@/services/portal/schemas';

const permission = { action: 'portal.mail.bulk', resourceType: 'client_mail' } as const;

/** Who would get a reminder now (the owner reviews this list before confirming). */
export const GET = withApi(
  { id: 'portal.bulk.estimates.preview', scope: 'tenant', permission },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await previewEstimateReminders(actor.companyId) };
  },
);

/** Send them. The owner confirms the exact number; a changed list is refused. */
export const POST = withApi(
  {
    id: 'portal.bulk.estimates.send',
    scope: 'tenant',
    permission,
    rateLimitPolicy: 'export',
    body: bulkConfirmBody,
    auditExempt: 'Every message leaves a delivery proof; the run is rate limited.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await sendEstimateReminders(actor, body.expectedCount) };
  },
);
