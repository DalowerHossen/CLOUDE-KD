// path: app/api/plans/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { publicPlans } from '@/services/plan/plans';

/** The plans shown on the pricing page and at sign-up: visible, not archived, in order. */
export const GET = withApi(
  {
    id: 'plans.public',
    scope: 'public',
    query: z.strictObject({}),
  },
  async () => {
    const plans = await publicPlans();
    return {
      data: plans.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        seatPriceMonthly: p.seatPriceMonthly,
        trialDays: p.trialDays,
        badge: p.badge,
        entitlements: p.entitlements,
      })),
    };
  },
);
