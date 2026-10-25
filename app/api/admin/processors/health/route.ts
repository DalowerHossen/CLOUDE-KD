// path: app/api/admin/processors/health/route.ts
// The stored health of all sixteen processors (no live call). The health page reads it every few seconds.
import { withApi } from '@/lib/api/with-api';
import { listHealth } from '@/services/payment/health';

export const GET = withApi(
  {
    id: 'admin.processors.health.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
  },
  async () => ({ data: await listHealth() }),
);
