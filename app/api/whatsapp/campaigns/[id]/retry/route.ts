// path: app/api/whatsapp/campaigns/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { WHATSAPP_STEP_UP_SECONDS } from '@/config/s16-whatsapp';
import { ForbiddenError } from '@/lib/errors';
import { retryFailed } from '@/services/whatsapp/campaigns';

/** Sends the failed messages that retrying can fix as a new campaign. Needs a fresh identity check. */
export const POST = withApi(
  {
    id: 'whatsapp.campaigns.retry',
    scope: 'tenant',
    permission: { action: 'whatsapp.campaigns.manage', resourceType: 'whatsapp_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    stepUp: { maxAgeSeconds: WHATSAPP_STEP_UP_SECONDS },
    auditExempt: 'The campaign service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await retryFailed(actor, params.id) };
  },
);
