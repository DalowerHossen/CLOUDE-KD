// path: app/api/invoices/[id]/status/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { statusOverrideSchema } from '@/lib/invoice/input';
import { overrideStatus } from '@/services/invoice/invoices';

export const POST = withApi(
  {
    id: 'invoices.override_status',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'invoice.override_status', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: statusOverrideSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await overrideStatus(actor, p.id, body.status, body.reason) };
  },
);
