// path: app/api/invoices/[id]/similar/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { findSimilarInvoices } from '@/services/invoice/send';

export const GET = withApi(
  {
    id: 'invoices.similar',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await findSimilarInvoices(actor.companyId, p.id) };
  },
);
