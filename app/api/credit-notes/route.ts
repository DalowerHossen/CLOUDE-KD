// path: app/api/credit-notes/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { listCreditNotes } from '@/services/credit/credit-notes';

export const GET = withApi(
  {
    id: 'creditNotes.list',
    scope: 'tenant',
    permission: { action: 'credit.read', resourceType: 'credit_note' },
    query: z
      .object({
        invoiceId: z.string().uuid().optional(),
        clientId: z.string().uuid().optional(),
        limit: z
          .string()
          .regex(/^\d{1,3}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listCreditNotes(actor.companyId, {
        invoiceId: query.invoiceId,
        clientId: query.clientId,
        limit: Math.min(toInt(query.limit, 50), 200),
      }),
    };
  },
);
