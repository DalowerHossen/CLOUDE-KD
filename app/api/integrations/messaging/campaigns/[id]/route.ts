// path: app/api/integrations/messaging/campaigns/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { campaignReport } from '@/services/messaging/campaigns';

/** The campaign with its report: messages by state, by variant and by channel, why messages were skipped, and the cost. */
export const GET = withApi(
  {
    id: 'messaging.campaigns.report',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await campaignReport(actor.companyId, params.id) };
  },
);
