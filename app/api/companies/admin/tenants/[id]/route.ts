// path: app/api/companies/admin/tenants/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { tenantDetail } from '@/services/company/admin';

export const GET = withApi(
  {
    id: 'admin.tenants.detail',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'people.read', resourceType: 'tenant' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ params }) => ({ data: await tenantDetail(params.id) }),
);
