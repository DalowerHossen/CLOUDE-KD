// path: app/api/invoices/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { invoiceUpdateSchema } from '@/lib/invoice/input';
import { getInvoice, trashInvoice, updateInvoice } from '@/services/invoice/invoices';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'invoices.get',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getInvoice(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'invoices.update',
    scope: 'tenant',
    permission: { action: 'invoice.update', resourceType: 'invoice' },
    params,
    body: invoiceUpdateSchema,
    maxBodyBytes: 5_000_000,
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return {
      data: await updateInvoice(actor, p.id, body.expectedVersion, body.invoice, body.autosave),
    };
  },
);

export const DELETE = withApi(
  {
    id: 'invoices.trash',
    scope: 'tenant',
    permission: { action: 'invoice.delete', resourceType: 'invoice' },
    params,
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await trashInvoice(actor, p.id);
    return { data: { id: p.id } };
  },
);
