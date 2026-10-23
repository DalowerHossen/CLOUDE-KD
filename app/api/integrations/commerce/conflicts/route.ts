// path: app/api/integrations/commerce/conflicts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listConflicts } from '@/services/integration/commerce-conflicts';

export const GET = withApi(
  {
    id: 'commerce.conflicts.list',
    scope: 'tenant',
    permission: { action: 'commerce.read', resourceType: 'integration_conflict' },
    query: z
      .object({
        status: z.enum(['open', 'resolved', 'ignored']).optional(),
        integrationId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listConflicts(actor.companyId, {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(query.integrationId ? { integrationId: query.integrationId } : {}),
      }),
    };
  },
);
