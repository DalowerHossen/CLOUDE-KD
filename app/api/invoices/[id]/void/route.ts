// path: app/api/invoices/[id]/void/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { plain } from '@/lib/crm/clients';
import { ForbiddenError } from '@/lib/errors';
import { voidInvoice } from '@/services/invoice/send';

export const POST = withApi(
  {
    id: 'invoices.void',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'invoice.void', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({ reason: plain(3, 300) }).strict(),
    rateLimitPolicy: 'strict',
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await voidInvoice(actor, p.id, body.reason) };
  },
);
