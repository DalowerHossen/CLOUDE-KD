// path: app/api/whatsapp/campaigns/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { campaignInput } from '@/lib/whatsapp/automation-rules';
import { createCampaign, listCampaigns } from '@/services/whatsapp/campaigns';

export const GET = withApi(
  {
    id: 'whatsapp.campaigns.list',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_campaign' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCampaigns(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'whatsapp.campaigns.create',
    scope: 'tenant',
    permission: { action: 'whatsapp.campaigns.manage', resourceType: 'whatsapp_campaign' },
    body: campaignInput,
    idempotent: true,
    auditExempt: 'The campaign service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createCampaign(actor, body) };
  },
);
