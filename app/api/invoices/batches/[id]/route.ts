// path: app/api/invoices/batches/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cancelBatch, getBatch } from '@/services/invoice/batch';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'invoiceBatches.get',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice_batch' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getBatch(actor.companyId, p.id) };
  },
);

/** Cancels the items that have not run yet. */
export const DELETE = withApi(
  {
    id: 'invoiceBatches.cancel',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice_batch' },
    params,
    auditExempt: 'The batch service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await cancelBatch(actor, p.id) };
  },
);
