// path: app/api/whatsapp/campaigns/[id]/start/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { WHATSAPP_STEP_UP_SECONDS } from '@/config/s16-whatsapp';
import { ForbiddenError } from '@/lib/errors';
import { startCampaign } from '@/services/whatsapp/campaigns';

/** Starts a draft (the audience is fixed now) or resumes a paused campaign. Needs a fresh identity check. */
export const POST = withApi(
  {
    id: 'whatsapp.campaigns.start',
    scope: 'tenant',
    permission: { action: 'whatsapp.campaigns.manage', resourceType: 'whatsapp_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z
      .object({ scheduledAt: z.string().datetime({ offset: true }).nullable().default(null) })
      .strict(),
    idempotent: true,
    stepUp: { maxAgeSeconds: WHATSAPP_STEP_UP_SECONDS },
    auditExempt: 'The campaign service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await startCampaign(actor, params.id, body.scheduledAt) };
  },
);
