// path: app/api/companies/admin/users/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { userDetail } from '@/services/company/admin';

export const GET = withApi(
  {
    id: 'admin.users.detail',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'people.read', resourceType: 'user' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ params }) => ({ data: await userDetail(params.id) }),
);
