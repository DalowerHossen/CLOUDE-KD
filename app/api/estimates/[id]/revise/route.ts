// path: app/api/estimates/[id]/revise/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { reviseEstimate } from '@/services/estimate/estimates';

export const POST = withApi(
  {
    id: 'estimates.revise',
    scope: 'tenant',
    permission: { action: 'estimate.update', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await reviseEstimate(actor, p.id) };
  },
);
