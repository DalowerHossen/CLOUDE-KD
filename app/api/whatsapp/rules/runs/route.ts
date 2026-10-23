// path: app/api/whatsapp/rules/runs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listRuns } from '@/services/whatsapp/rules';

export const GET = withApi(
  {
    id: 'whatsapp.rules.runs',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_rule' },
    query: z
      .object({
        ruleId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRuns(actor.companyId, query.ruleId, query.limit) };
  },
);
