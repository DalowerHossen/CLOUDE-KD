// path: app/api/admin/storage/route.ts
import { withApi } from '@/lib/api/with-api';
import { storageOverview } from '@/services/storage/admin-ops';

export const GET = withApi(
  {
    id: 'admin.storage.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'storage.admin', resourceType: 'storage' },
  },
  async () => ({ data: await storageOverview() }),
);
