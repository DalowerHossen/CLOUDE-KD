// path: app/api/integrations/messaging/reports/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { channelStats, costReport } from '@/services/messaging/reports';

/** Delivery and engagement per channel, and the cost per month and channel. */
export const GET = withApi(
  {
    id: 'messaging.reports',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_message' },
    query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: {
        channels: await channelStats(actor.companyId, query.days),
        costs: await costReport(actor.companyId),
      },
    };
  },
);
