// path: app/api/invoices/[id]/restore/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { restoreInvoice } from '@/services/invoice/invoices';

export const POST = withApi(
  {
    id: 'invoices.restore',
    scope: 'tenant',
    permission: { action: 'invoice.delete', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await restoreInvoice(actor, p.id) };
  },
);
