// path: app/api/invoices/batches/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryBatch } from '@/services/invoice/batch';

export const POST = withApi(
  {
    id: 'invoiceBatches.retry',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice_batch' },
    params: z.object({ id: z.string().uuid() }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The batch service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await retryBatch(actor, p.id) };
  },
);
