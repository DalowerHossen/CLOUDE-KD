// path: app/api/estimates/[id]/send/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { estimateSendSchema } from '@/lib/estimate/input';
import { sendEstimate } from '@/services/estimate/estimates';

export const POST = withApi(
  {
    id: 'estimates.send',
    scope: 'tenant',
    permission: { action: 'estimate.send', resourceType: 'estimate' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: estimateSendSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await sendEstimate(actor, p.id, body.message) };
  },
);
