// path: app/api/payment-links/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { revokePaymentLink } from '@/services/payment/links';

const params = z.object({ id: z.string().uuid() }).strict();

export const DELETE = withApi(
  {
    id: 'paymentLinks.revoke',
    scope: 'tenant',
    permission: { action: 'payment.link.manage', resourceType: 'payment_link' },
    params,
    auditExempt: 'The link service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await revokePaymentLink(actor, p.id);
    return { data: { revoked: true } };
  },
);
