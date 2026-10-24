// path: app/api/invoices/[id]/events/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listInvoiceEvents } from '@/services/invoice/events';
import { getInvoice } from '@/services/invoice/invoices';

export const GET = withApi(
  {
    id: 'invoices.events',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await getInvoice(actor.companyId, p.id, { includeTrashed: true });
    return { data: await listInvoiceEvents(actor.companyId, p.id) };
  },
);
