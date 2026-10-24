// path: app/api/invoices/[id]/revisions/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listRevisions } from '@/services/invoice/invoices';

export const GET = withApi(
  {
    id: 'invoices.revisions',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listRevisions(actor.companyId, p.id) };
  },
);
