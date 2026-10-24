// path: app/api/integrations/messaging/campaigns/preview/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { audienceInput } from '@/lib/messaging/rules';
import { previewAudience } from '@/services/messaging/campaigns';

/** How many clients an audience reaches. Nothing is sent. */
export const POST = withApi(
  {
    id: 'messaging.campaigns.preview',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_campaign' },
    body: audienceInput,
    auditExempt: 'This call changes nothing.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await previewAudience(actor.companyId, body) };
  },
);
