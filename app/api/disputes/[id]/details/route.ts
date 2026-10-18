// path: app/api/disputes/[id]/details/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { setDisputeDetails } from '@/services/dispute/disputes';

const params = z.object({ id: z.string().uuid() }).strict();

/** The real reason code and answer date from the processor's dashboard. */
export const PUT = withApi(
  {
    id: 'disputes.details',
    scope: 'tenant',
    permission: { action: 'dispute.manage', resourceType: 'dispute' },
    params,
    body: z.strictObject({
      reasonCode: plain(1, 80).nullable(),
      dueAt: z.string().datetime().nullable(),
    }),
    auditExempt: 'The dispute table has the audit trigger and the case history records the change.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await setDisputeDetails(actor, p.id, body) };
  },
);
