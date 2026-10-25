// path: app/api/payment-links/embed-origins/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { removeEmbedOrigin } from '@/services/payment/embed-origins';

export const DELETE = withApi(
  {
    id: 'paymentLinks.embedOrigins.remove',
    scope: 'tenant',
    permission: { action: 'payment.link.manage', resourceType: 'payment_link' },
    rateLimitPolicy: 'strict',
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The embed origin service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor) throw new ForbiddenError();
    await removeEmbedOrigin(actor, params.id);
    return { data: { done: true } };
  },
);
