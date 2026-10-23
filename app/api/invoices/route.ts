// path: app/api/invoices/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { invoiceInputSchema } from '@/lib/invoice/input';
import { invoiceListQuery } from '@/lib/invoice/search';
import { createInvoice } from '@/services/invoice/invoices';
import { searchInvoices } from '@/services/invoice/search';

export const GET = withApi(
  {
    id: 'invoices.list',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    query: invoiceListQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await searchInvoices(actor.companyId, query) };
  },
);

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
