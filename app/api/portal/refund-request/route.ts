// path: app/api/portal/refund-request/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { NotFoundError } from '@/lib/errors';
import { submitRefundRequest } from '@/services/dispute/refund-requests';
import { resolvePortalAccess } from '@/services/portal/access';
import { portalTokenSchema } from '@/services/portal/schemas';

/** The client asks for a refund from the receipt page. The owner decides; nothing is paid back here. */
export const POST = withApi(
  {
    id: 'portal.refundRequest',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    body: z.strictObject({
      token: portalTokenSchema,
      amount: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'Use a number such as 25 or 25.50.'),
      reason: plain(3, 1000),
    }),
    auditExempt:
      'The refund request table has the audit trigger and the portal event records the ask.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['receipt']);
    if (access.state !== 'ok') throw new NotFoundError();
    return {
      status: 201,
      data: await submitRefundRequest(access, { amount: body.amount, reason: body.reason }),
    };
  },
);
