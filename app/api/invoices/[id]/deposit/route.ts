// path: app/api/invoices/[id]/deposit/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { depositCreateSchema } from '@/lib/credit/input';
import { createDeposit } from '@/services/credit/adjustments';

export const POST = withApi(
  {
    id: 'invoices.deposit',
    scope: 'tenant',
    permission: { action: 'credit.create', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: depositCreateSchema,
    idempotent: true,
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createDeposit(actor, { type: 'invoice', id: p.id }, body) };
  },
);
