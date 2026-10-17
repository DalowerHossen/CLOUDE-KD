// path: app/api/estimates/[id]/void/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { estimateVoidSchema } from '@/lib/estimate/input';
import { voidEstimate } from '@/services/estimate/estimates';

export const POST = withApi(
  {
    id: 'estimates.void',
    scope: 'tenant',
    permission: { action: 'estimate.void', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: estimateVoidSchema,
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await voidEstimate(actor, p.id, body.reason) };
  },
);
