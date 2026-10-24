// path: app/api/coupons/validate/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { codeSchema } from '@/lib/payment/coupon-rules';
import { previewCoupon } from '@/services/coupon/redeem';
import { getPlanBySlug } from '@/services/plan/plans';
import { amountFor } from '@/services/subscription/platform';

/** Tells the owner what a code would do at checkout, without using it. Wrong codes are counted. */
export const POST = withApi(
  {
    id: 'coupons.validate',
    scope: 'tenant',
    networkContext: 'payment',
    permission: { action: 'subscription.manage', resourceType: 'coupon' },
    rateLimitPolicy: 'strict',
    body: z.strictObject({
      code: codeSchema,
      planSlug: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
      interval: z.enum(['month', 'year']),
    }),
    auditExempt: 'This route changes nothing except the count of wrong codes.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const plan = await getPlanBySlug(body.planSlug);
    if (!plan) throw new NotFoundError();
    const amount = await amountFor(actor.companyId, plan, body.interval);
    return { data: await previewCoupon(actor.companyId, body.code, plan.slug, amount) };
  },
);
