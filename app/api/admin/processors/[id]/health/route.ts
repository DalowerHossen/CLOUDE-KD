// path: app/api/admin/processors/[id]/health/route.ts
// Runs one live health check of a processor (sandbox or live, as the processor is set) and records it. The result is shown
// to the super admin; a check asked for here never switches the processor off by itself.
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { checkProcessorNow } from '@/services/payment/health';

const params = z.object({ id: z.string().regex(/^[a-z]{2,20}$/) }).strict();

export const GET = withApi(
  {
    id: 'admin.processors.health.check',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    rateLimitPolicy: 'strict',
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await checkProcessorNow(actor, p.id) };
  },
);
