// path: app/api/estimates/[id]/convert/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { convertEstimate } from '@/services/estimate/estimates';

export const POST = withApi(
  {
    id: 'estimates.convert',
    scope: 'tenant',
    permission: { action: 'estimate.convert', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await convertEstimate(actor, p.id) };
  },
);
