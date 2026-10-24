// path: app/api/subscriptions/client/report/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { clientSubscriptionReport } from '@/services/subscription/client-reports';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.');

export const GET = withApi(
  {
    id: 'client-subscriptions.report',
    scope: 'tenant',
    permission: { action: 'client_subscription.read', resourceType: 'client_subscription' },
    query: z.strictObject({ from: day, to: day }),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (query.from >= query.to)
      throw new ValidationError('The end date must be after the start date.');
    return { data: await clientSubscriptionReport(actor.companyId, query.from, query.to) };
  },
);
