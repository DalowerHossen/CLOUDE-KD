// path: app/api/invoices/[id]/send/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { plain } from '@/lib/crm/clients';
import { sendInvoice } from '@/services/invoice/send';

export const POST = withApi(
  {
    id: 'invoices.send',
    scope: 'tenant',
    permission: { action: 'invoice.send', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({ confirmDuplicate: z.boolean(), message: plain(0, 1000) }).strict(),
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await sendInvoice(actor, p.id, body) };
  },
);
