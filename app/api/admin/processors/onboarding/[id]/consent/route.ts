// path: app/api/admin/processors/onboarding/[id]/consent/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { consentUrl } from '@/services/payment/onboarding';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'admin.onboarding.consent',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    params,
  },
  async ({ params: p }) => ({ data: { url: await consentUrl(p.id) } }),
);
