// path: app/api/whatsapp/campaigns/preview/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { segmentInput } from '@/lib/whatsapp/automation-rules';
import { previewAudience } from '@/services/whatsapp/campaigns';

/** How many people a segment reaches and why others are left out. Changes nothing. */
export const POST = withApi(
  {
    id: 'whatsapp.campaigns.preview',
    scope: 'tenant',
    permission: { action: 'whatsapp.campaigns.manage', resourceType: 'whatsapp_campaign' },
    body: z.object({ segment: segmentInput }).strict(),
    auditExempt: 'This route changes nothing.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await previewAudience(actor, body.segment) };
  },
);
