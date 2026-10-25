// path: app/api/payment-links/embed-origins/route.ts
// The merchant's list of web sites that may show its payment links in the embedded checkout.
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { originInput } from '@/lib/payment/embed-sdk/rules';
import { addEmbedOrigin, listEmbedOrigins } from '@/services/payment/embed-origins';

export const GET = withApi(
  {
    id: 'paymentLinks.embedOrigins.list',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment_link' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEmbedOrigins(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'paymentLinks.embedOrigins.add',
    scope: 'tenant',
    permission: { action: 'payment.link.manage', resourceType: 'payment_link' },
    rateLimitPolicy: 'strict',
    body: originInput,
    auditExempt: 'The embed origin service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await addEmbedOrigin(actor, body.origin) };
  },
);
