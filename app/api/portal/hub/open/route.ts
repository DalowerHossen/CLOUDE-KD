// path: app/api/portal/hub/open/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { resolvePortalAccess } from '@/services/portal/access';
import { openHubInvoice } from '@/services/portal/hub';
import { hubOpenBody } from '@/services/portal/schemas';

/** "Open" on a hub row: a short-lived invoice link for an invoice of this client; the answer is the path of its page. */
export const POST = withApi(
  {
    id: 'portal.hubOpen',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: hubOpenBody,
    auditExempt: 'The tokens service records the issued link.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['hub']);
    if (access.state !== 'ok') throw new NotFoundError();
    return { status: 201, data: { path: await openHubInvoice(access, body.invoiceId) } };
  },
);
