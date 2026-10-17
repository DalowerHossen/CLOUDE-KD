// path: app/api/admin/processors/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { getProcessorDetail } from '@/services/payment/processors';

const params = z.object({ id: z.string().regex(/^[a-z]{2,20}$/) }).strict();

export const GET = withApi(
  {
    id: 'admin.processors.get',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.view', resourceType: 'processor' },
    params,
  },
  async ({ params: p }) => ({ data: await getProcessorDetail(p.id) }),
);
