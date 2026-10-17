// path: app/api/admin/processors/[id]/actions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { processorActionSchema } from '@/schemas/payment/processors';
import { runProcessorAction } from '@/services/payment/processors';

const params = z.object({ id: z.string().regex(/^[a-z]{2,20}$/) }).strict();

export const POST = withApi(
  {
    id: 'admin.processors.action',
    scope: 'platform',
    roles: ['super_admin'],
    networkContext: 'admin',
    permission: { action: 'payment.processor.manage', resourceType: 'processor' },
    stepUp: { maxAgeSeconds: 300 },
    rateLimitPolicy: 'strict',
    params,
    body: processorActionSchema,
    auditExempt: 'The processor service writes the audit entry of every action.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await runProcessorAction(actor, p.id, body) };
  },
);
