// path: app/api/integrations/messaging/campaigns/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { campaignInput } from '@/lib/messaging/rules';
import { createCampaign, listCampaigns } from '@/services/messaging/campaigns';

export const GET = withApi(
  {
    id: 'messaging.campaigns.list',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_campaign' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCampaigns(actor.companyId) };
  },
);

/** Makes a draft campaign with one variant, or two to four for an A/B test. */
export const POST = withApi(
  {
    id: 'messaging.campaigns.create',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_campaign' },
    body: campaignInput,
    idempotent: true,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createCampaign(actor, body) };
  },
);
