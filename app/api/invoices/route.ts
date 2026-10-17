// path: app/api/invoices/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { invoiceInputSchema } from '@/lib/invoice/input';
import { createInvoice } from '@/services/invoice/invoices';

export const POST = withApi(
  {
    id: 'invoices.create',
    scope: 'tenant',
    permission: { action: 'invoice.create', resourceType: 'invoice' },
    body: invoiceInputSchema,
    idempotent: true,
    maxBodyBytes: 5_000_000,
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createInvoice(actor, body) };
  },
);
