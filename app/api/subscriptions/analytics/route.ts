// path: app/api/subscriptions/analytics/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ValidationError } from '@/lib/errors';
import { moneyFlowReport, revenueReport, tenantHealth } from '@/services/subscription/analytics';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.');

export const GET = withApi(
  {
    id: 'subscriptions.analytics',
    scope: 'platform',
    networkContext: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    permission: { action: 'subscription.admin', resourceType: 'revenue' },
    query: z.strictObject({ from: day, to: day }),
  },
  async ({ query }) => {
    if (query.from >= query.to)
      throw new ValidationError('The end date must be after the start date.');
    const [revenue, flow, health] = await Promise.all([
      revenueReport(query.from, query.to),
      moneyFlowReport(query.from, query.to),
      tenantHealth(50),
    ]);
    return { data: { revenue, flow, health } };
  },
);
