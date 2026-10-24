// path: app/api/integrations/commerce/log/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listLog, syncStatus } from '@/services/integration/commerce-log';

/** The sync log (newest first) and the numbers of the status page. */
export const GET = withApi(
  {
    id: 'commerce.log.list',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration' },
    query: z
      .object({
        integrationId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        level: z.enum(['info', 'warn', 'error']).optional(),
        limit: z.coerce.number().int().min(1).max(300).default(100),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const filter = {
      limit: query.limit,
      ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.level ? { level: query.level } : {}),
    };
    return {
      data: {
        status: await syncStatus(actor.companyId, query.integrationId),
        lines: await listLog(actor.companyId, filter),
      },
    };
  },
);
