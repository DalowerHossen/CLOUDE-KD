// path: app/api/social/rules/runs/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listRuns } from '@/services/social/rules';

/** The log of the rules: what each one made, or would have made in a dry run. */
export const GET = withApi(
  {
    id: 'social.rules.runs',
    scope: 'tenant',
    permission: { action: 'social.read', resourceType: 'social_rule' },
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRuns(actor.companyId, query.limit) };
  },
);
