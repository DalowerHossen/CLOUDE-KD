// path: app/api/companies/admin/overview/route.ts
import { withApi } from '@/lib/api/with-api';
import { overview } from '@/services/company/admin';

export const GET = withApi(
  {
    id: 'admin.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'admin.home', resourceType: 'platform' },
  },
  async () => ({ data: await overview() }),
);
