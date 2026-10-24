// path: app/api/contracts/[id]/events/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listEvents } from '@/services/contract/contracts';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'contracts.events',
    scope: 'tenant',
    permission: { action: 'contract.read', resourceType: 'contract' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEvents(actor.companyId, p.id) };
  },
);
