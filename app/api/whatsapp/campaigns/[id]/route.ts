// path: app/api/whatsapp/campaigns/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { campaignReport } from '@/services/whatsapp/campaigns';

/** The delivery report of a campaign: item and message statuses, failure and skip reasons, delivered and read share. */
export const GET = withApi(
  {
    id: 'whatsapp.campaigns.report',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await campaignReport(actor.companyId, params.id) };
  },
);
