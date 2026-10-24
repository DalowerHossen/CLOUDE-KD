// path: app/api/integrations/gateway/calls/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listCalls } from '@/services/gateway/calls';

const query = z
  .object({
    subMerchantId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const GET = withApi(
  {
    id: 'gateway.calls.list',
    scope: 'tenant',
    permission: { action: 'gateway.read', resourceType: 'gateway_call' },
    query,
  },
  async ({ actor, query: q }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listCalls(actor.companyId, q.subMerchantId ?? null, q.limit) };
  },
);
