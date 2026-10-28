// path: app/api/admin/processors/onboarding/packages/[packageId]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { PACKAGE_ID } from '@/lib/payment/onboarding/rules';
import { getPackage } from '@/services/payment/onboarding';

const params = z.object({ packageId: z.string().regex(PACKAGE_ID) }).strict();

export const GET = withApi(
  {
    id: 'admin.onboarding.package',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
    params,
  },
  async ({ params: p }) => ({ data: await getPackage(p.packageId) }),
);
