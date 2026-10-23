// path: app/api/invoices/[id]/credit-note/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { creditCreateSchema } from '@/lib/credit/input';
import { createCreditNote } from '@/services/credit/credit-notes';

export const POST = withApi(
  {
    id: 'invoices.creditNote',
    scope: 'tenant',
    permission: { action: 'credit.create', resourceType: 'credit_note' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: creditCreateSchema,
    idempotent: true,
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createCreditNote(actor, p.id, body) };
  },
);
