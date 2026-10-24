// path: app/api/estimates/[id]/restore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { restoreEstimate } from '@/services/estimate/estimates';

export const POST = withApi(
  {
    id: 'estimates.restore',
    scope: 'tenant',
    permission: { action: 'estimate.delete', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await restoreEstimate(actor, p.id) };
  },
);
