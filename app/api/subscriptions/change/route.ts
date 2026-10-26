// path: app/api/subscriptions/change/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { surveyAnswerSchema } from '@/lib/platform/retention';
import { recordContinued } from '@/services/platform/retention';
import { changePlan, getSubscription } from '@/services/subscription/platform';

export const POST = withApi(
  {
    id: 'subscriptions.change',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'subscription.manage', resourceType: 'subscription' },
    rateLimitPolicy: 'strict',
    idempotent: true,
    body: z.strictObject({
      planSlug: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
      interval: z.enum(['month', 'year']),
      survey: surveyAnswerSchema.optional(),
    }),
    auditExempt: 'The subscription service writes the audit entry and the subscription history.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!idempotencyKey) throw new ValidationError('The Idempotency-Key header is required.');
    const before = await getSubscription(actor.companyId).catch(() => null);
    const { survey, ...change } = body;
    const result = await changePlan(actor, { ...change, requestKey: idempotencyKey });
    if (survey && result.kind === 'downgrade')
      await recordContinued(actor, 'downgrade', survey, before?.planSlug ?? null, change.planSlug);
    return { data: result };
  },
);
