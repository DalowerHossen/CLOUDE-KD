// path: app/api/clients/[id]/export/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { exportClient } from '@/services/client/export';

// Reading all data of a person is audited by the service and limited by the strict rate policy (data exfiltration signal).
export const GET = withApi(
  {
    id: 'clients.export',
    scope: 'tenant',
    permission: { action: 'client.export', resourceType: 'client' },
    rateLimitPolicy: 'strict',
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await exportClient(actor, p.id) };
  },
);
