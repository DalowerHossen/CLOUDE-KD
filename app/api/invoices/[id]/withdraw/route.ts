// path: app/api/invoices/[id]/withdraw/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { withdrawInvoice } from '@/services/invoice/send';

export const POST = withApi(
  {
    id: 'invoices.withdraw',
    scope: 'tenant',
    permission: { action: 'invoice.send', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The invoice service writes the event entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await withdrawInvoice(actor, p.id) };
  },
);
