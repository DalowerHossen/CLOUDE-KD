// path: app/api/invoices/[id]/convert/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { convertProforma } from '@/services/invoice/proforma';

export const POST = withApi(
  {
    id: 'invoices.convertProforma',
    scope: 'tenant',
    permission: { action: 'invoice.create', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await convertProforma(actor, p.id) };
  },
);
