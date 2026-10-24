// path: app/api/public-site/lead/route.ts
import { withApi } from '@/lib/api/with-api';
import { LEAD_THANKS, captureLead } from '@/services/marketing/leads';
import { leadCaptureSchema } from '@/services/marketing/schemas';

export const POST = withApi(
  {
    id: 'public.lead',
    scope: 'public',
    rateLimitPolicy: 'strict',
    body: leadCaptureSchema,
    auditExempt: 'The lead is stored in leads, which is its own record, with the consent evidence.',
  },
  async ({ body, ip }) => {
    await captureLead(body, ip);
    return { status: 202, data: { message: LEAD_THANKS } };
  },
);
