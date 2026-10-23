// path: app/api/integrations/messaging/campaigns/[id]/start/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { MESSAGING_STEP_UP_SECONDS } from '@/config/s16-messaging';
import { ForbiddenError } from '@/lib/errors';
import { startCampaign } from '@/services/messaging/campaigns';

/** Starts a draft. The owner confirms the number of clients; a list that changed in between is refused. Needs a fresh identity check. */
export const POST = withApi(
  {
    id: 'messaging.campaigns.start',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({ expectedCount: z.number().int().min(1).max(5000) }).strict(),
    idempotent: true,
    stepUp: { maxAgeSeconds: MESSAGING_STEP_UP_SECONDS },
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await startCampaign(actor, params.id, body.expectedCount) };
  },
);
