// path: app/api/subscriptions/invoices/[id]/pay/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { recordBankPayment } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.invoices.pay',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin'],
    permission: { action: 'subscription.admin', resourceType: 'platform_invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.strictObject({ reference: z.string().trim().min(3).max(120) }),
    auditExempt: 'The subscription service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await recordBankPayment(actor, params.id, body.reference) };
  },
);
