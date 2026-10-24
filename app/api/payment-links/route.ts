// path: app/api/payment-links/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { linkCreateSchema } from '@/schemas/payment/payments';
import { createPaymentLink, listPaymentLinks } from '@/services/payment/links';

export const GET = withApi(
  {
    id: 'paymentLinks.list',
    scope: 'tenant',
    permission: { action: 'payment.read', resourceType: 'payment_link' },
    query: z.object({ invoiceId: z.string().uuid().optional() }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listPaymentLinks(actor.companyId, query.invoiceId ?? null) };
  },
);

export const POST = withApi(
  {
    id: 'paymentLinks.create',
    scope: 'tenant',
    permission: { action: 'payment.link.manage', resourceType: 'payment_link' },
    rateLimitPolicy: 'strict',
    body: linkCreateSchema,
    auditExempt: 'The link service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    const created = await createPaymentLink(actor, {
      invoiceId: body.invoiceId,
      amount: body.amount === null ? null : Money.parse(body.amount),
      validHours: body.validHours,
    });
    return { status: 201, data: created };
  },
);
