// path: app/api/admin/processors/accounts/[id]/onboarding-link/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { onboardingLinkFor } from '@/services/payment/stripe-connect';

export const POST = withApi(
  {
    id: 'admin.accounts.onboarding_link',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    auditExempt: 'The Stripe service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { url: await onboardingLinkFor(actor, params.id) } };
  },
);
