// path: app/api/invoices/batches/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { batchCreateSchema } from '@/lib/invoice/batch';
import { createBatch, listBatches } from '@/services/invoice/batch';

export const GET = withApi(
  {
    id: 'invoiceBatches.list',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice_batch' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listBatches(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'invoiceBatches.create',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice_batch' },
    body: batchCreateSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    maxBodyBytes: 5_000_000,
    auditExempt: 'The batch service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createBatch(actor, body) };
  },
);
