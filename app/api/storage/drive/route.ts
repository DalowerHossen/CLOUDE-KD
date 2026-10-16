// path: app/api/storage/drive/route.ts
import { withApi } from '@/lib/api/with-api';
import { driveStatus } from '@/services/storage/drive-link';

export const GET = withApi(
  {
    id: 'storage.drive.status',
    scope: 'tenant',
    permission: { action: 'storage.manage', resourceType: 'storage' },
  },
  async ({ tenant }) => {
    if (!tenant) throw new Error('unreachable');
    return { data: await driveStatus(tenant.companyId) };
  },
);
