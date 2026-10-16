// path: app/api/admin/impersonation/route.ts
import { withApi } from '@/lib/api/with-api';
import { listImpersonations } from '@/services/auth/impersonation-flow';

export const GET = withApi(
  {
    id: 'admin.impersonation.list',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'auth.impersonate', resourceType: 'impersonation_session' },
  },
  async () => ({ data: { items: await listImpersonations() } }),
);
