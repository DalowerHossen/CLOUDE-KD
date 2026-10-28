// path: app/api/admin/processors/stripe/connect/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { stripeConnectInput } from '@/lib/payment/company-accounts-rules';
import { createCompanyAccount } from '@/services/payment/stripe-connect';

export const POST = withApi(
  {
    id: 'admin.stripe.connect',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: stripeConnectInput,
    auditExempt: 'The accounts service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createCompanyAccount(actor, body) };
  },
);
