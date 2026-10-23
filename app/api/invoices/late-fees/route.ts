// path: app/api/invoices/late-fees/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listLateFees } from '@/services/invoice/late-fees';

export const GET = withApi(
  {
    id: 'lateFees.list',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'late_fee' },
    query: z
      .object({
        status: z.enum(['proposed', 'applied', 'waived']).optional(),
        invoiceId: z.string().uuid().optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listLateFees(actor.companyId, {
        status: query.status,
        invoiceId: query.invoiceId,
        limit: 200,
      }),
    };
  },
);
