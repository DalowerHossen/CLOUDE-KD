// path: app/api/admin/processors/route.ts
import { withApi } from '@/lib/api/with-api';
import { listProcessors } from '@/services/payment/processors';

export const GET = withApi(
  {
    id: 'admin.processors.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
  },
  async () => ({ data: await listProcessors() }),
);
