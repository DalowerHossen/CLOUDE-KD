// path: app/api/invoices/[id]/clone/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cloneInvoice } from '@/services/invoice/invoices';

export const POST = withApi(
  {
    id: 'invoices.clone',
    scope: 'tenant',
    permission: { action: 'invoice.create', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await cloneInvoice(actor, p.id) };
  },
);
