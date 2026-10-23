// path: app/api/portal/pay-link/route.ts
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { tokenOnlyBody } from '@/services/portal/schemas';
import { resolvePortalAccess } from '@/services/portal/access';
import { createPortalPayPath } from '@/services/portal/pay-link';

/** "Pay now" on the invoice page: a short-lived payment link for the balance; the answer is the path of its page. */
export const POST = withApi(
  {
    id: 'portal.payLink',
    scope: 'public',
    networkContext: 'payment',
    rateLimitPolicy: 'strict',
    body: tokenOnlyBody,
    auditExempt: 'The payment link service writes the audit entry.',
  },
  async ({ body }) => {
    const access = await resolvePortalAccess(body.token, ['invoice']);
    if (access.state !== 'ok') throw new NotFoundError();
    return { status: 201, data: { path: await createPortalPayPath(access) } };
  },
);
