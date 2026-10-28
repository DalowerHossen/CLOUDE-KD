// path: app/api/admin/processors/stripe/webhooks/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { registerWebhooks } from '@/services/payment/stripe-connect';

export const POST = withApi(
  {
    id: 'admin.stripe.webhooks',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: z.object({}).strict(),
    auditExempt: 'The Stripe service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await registerWebhooks(actor) };
  },
);
