// path: app/api/marketing/campaigns/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listCampaigns, runCampaignAction, saveCampaign } from '@/services/marketing/admin';
import { campaignActionSchema, campaignSchema } from '@/services/marketing/schemas';

export const GET = withApi(
  {
    id: 'marketing.campaigns.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.read', resourceType: 'marketing' },
  },
  async () => ({ data: await listCampaigns() }),
);

export const POST = withApi(
  {
    id: 'marketing.campaigns.save',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.edit', resourceType: 'marketing' },
    body: campaignSchema,
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveCampaign(actor, body);
    return { data: { done: true } };
  },
);

export const PUT = withApi(
  {
    id: 'marketing.campaigns.action',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'marketing.send', resourceType: 'marketing' },
    stepUp: { maxAgeSeconds: 300 },
    body: campaignActionSchema,
    auditExempt: 'The marketing service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runCampaignAction(actor, body) };
  },
);
