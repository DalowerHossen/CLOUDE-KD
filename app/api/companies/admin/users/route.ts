// path: app/api/companies/admin/users/route.ts
import { withApi } from '@/lib/api/with-api';
import { userListQuery } from '@/lib/company/admin-input';
import { listUsers } from '@/services/company/admin';

export const GET = withApi(
  {
    id: 'admin.users.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'people.read', resourceType: 'user' },
    query: userListQuery,
  },
  async ({ query }) => ({ data: await listUsers(query) }),
);
