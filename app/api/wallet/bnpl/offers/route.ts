// path: app/api/wallet/bnpl/offers/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { acceptOffer } from '@/services/bnpl/installments';
import { offersForInvoice } from '@/services/bnpl/offers';

export const GET = withApi(
  {
    id: 'bnpl.offers',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'bnpl' },
    query: z.strictObject({ invoiceId: z.string().uuid() }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await offersForInvoice(actor.companyId, query.invoiceId) };
  },
);

export const POST = withApi(
  {
    id: 'bnpl.accept',
    scope: 'tenant',
    permission: { action: 'client_subscription.manage', resourceType: 'bnpl' },
    body: z.strictObject({ invoiceId: z.string().uuid(), terms: z.number().int().min(2).max(24) }),
    idempotent: true,
    auditExempt: 'The installment service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await acceptOffer(actor, body.invoiceId, body.terms) };
  },
);
