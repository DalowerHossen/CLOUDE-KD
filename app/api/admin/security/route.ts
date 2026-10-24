// path: app/api/admin/security/route.ts
import { withApi } from '@/lib/api/with-api';
import { overview } from '@/services/security/admin-ops';

export const GET = withApi(
  {
    id: 'admin.security.overview',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'security.read', resourceType: 'security' },
  },
  async () => ({ data: await overview() }),
);
