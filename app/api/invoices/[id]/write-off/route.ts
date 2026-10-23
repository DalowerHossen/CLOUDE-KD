// path: app/api/invoices/[id]/write-off/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { writeOffSchema } from '@/lib/schedule/input';
import { listWriteOffs, writeOffInvoice } from '@/services/invoice/write-off';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'invoices.writeOffs',
    scope: 'tenant',
    permission: { action: 'invoice.read', resourceType: 'invoice' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listWriteOffs(actor.companyId, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'invoices.writeOff',
    scope: 'tenant',
    permission: { action: 'invoice.writeoff', resourceType: 'invoice' },
    params,
    body: writeOffSchema,
    idempotent: true,
    rateLimitPolicy: 'strict',
    auditExempt: 'The write-off service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await writeOffInvoice(actor, p.id, body) };
  },
);
