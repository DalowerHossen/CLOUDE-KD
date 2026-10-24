// path: app/api/invoices/[id]/number/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { manualNumberSchema } from '@/lib/invoice/numbering';
import { setManualNumber } from '@/services/invoice/numbering';

export const POST = withApi(
  {
    id: 'invoices.number',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'invoice.update', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: manualNumberSchema,
    auditExempt: 'The numbering service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: { number: await setManualNumber(actor, p.id, body.number) } };
  },
);
