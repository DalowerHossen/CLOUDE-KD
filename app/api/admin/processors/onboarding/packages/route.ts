// path: app/api/admin/processors/onboarding/packages/route.ts
import { withApi } from '@/lib/api/with-api';
import { listPackages } from '@/services/payment/onboarding';

export const GET = withApi(
  {
    id: 'admin.onboarding.packages',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
  },
  async () => ({ data: await listPackages() }),
);
