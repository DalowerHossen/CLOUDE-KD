// path: app/api/invoices/numbering/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { INVOICE_KINDS } from '@/lib/invoice/input';
import { previewNextNumber } from '@/services/invoice/numbering';

export const GET = withApi(
  {
    id: 'invoices.numbering_preview',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    query: z.object({ kind: z.enum(INVOICE_KINDS) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { next: await previewNextNumber(actor.companyId, query.kind) } };
  },
);
