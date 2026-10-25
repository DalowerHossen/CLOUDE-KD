// path: app/api/portal/invoice-cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { NotFoundError } from '@/lib/errors';
import { resolvePortalAccess } from '@/services/portal/access';
import { cancelInvoiceByClient } from '@/services/portal/invoice-cancel';
import { portalTokenSchema } from '@/services/portal/schemas';

/** The client cancels an unpaid invoice from the invoice page. The invoice event, the audit entry and the owner's notice record it. */
export const POST = withApi(
  {
    id: 'portal.invoiceCancel',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    body: z.strictObject({ token: portalTokenSchema, reason: plain(0, 300) }),
    auditExempt: 'The invoice service writes the audit entry for the void.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['invoice']);
    if (access.state !== 'ok') throw new NotFoundError();
    return { data: await cancelInvoiceByClient(access, body.reason) };
  },
);
