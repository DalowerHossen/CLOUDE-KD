// path: app/api/subscriptions/subscribe/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { codeSchema } from '@/lib/payment/coupon-rules';
import { subscribe } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.subscribe',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    rateLimitPolicy: 'strict',
    idempotent: true,
    body: z.strictObject({
      planSlug: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
      interval: z.enum(['month', 'year']),
      couponCode: codeSchema.optional(),
    }),
    auditExempt: 'The subscription service writes the audit entry and the subscription history.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    return { data: await subscribe(actor, { ...body, requestKey: idempotencyKey }) };
  },
);
