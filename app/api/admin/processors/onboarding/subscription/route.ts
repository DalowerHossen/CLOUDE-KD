// path: app/api/admin/processors/onboarding/subscription/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { subscribeInput } from '@/lib/payment/onboarding/rules';
import { subscribeWebhook } from '@/services/payment/onboarding';

export const POST = withApi(
  {
    id: 'admin.onboarding.subscribe',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    body: subscribeInput,
    auditExempt: 'The onboarding service writes the audit entry.',
  },
  async ({ actor }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await subscribeWebhook(actor) };
  },
);
