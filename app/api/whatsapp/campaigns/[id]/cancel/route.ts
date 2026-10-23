// path: app/api/whatsapp/campaigns/[id]/cancel/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelCampaign } from '@/services/whatsapp/campaigns';

export const POST = withApi(
  {
    id: 'whatsapp.campaigns.cancel',
    scope: 'tenant',
    permission: { action: 'whatsapp.campaigns.manage', resourceType: 'whatsapp_campaign' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    auditExempt: 'The campaign service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await cancelCampaign(actor, params.id) };
  },
);
