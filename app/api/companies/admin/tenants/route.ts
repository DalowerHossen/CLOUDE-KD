// path: app/api/companies/admin/tenants/route.ts
import { withApi } from '@/lib/api/with-api';
import { tenantListQuery } from '@/lib/company/admin-input';
import { listTenants } from '@/services/company/admin';

export const GET = withApi(
  {
    id: 'admin.tenants.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'people.read', resourceType: 'tenant' },
    query: tenantListQuery,
  },
  async ({ query }) => ({ data: await listTenants(query) }),
);
