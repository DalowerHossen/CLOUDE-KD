// path: app/api/invoices/[id]/debit-note/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { debitNoteSchema } from '@/lib/credit/input';
import { createDebitNote } from '@/services/credit/adjustments';

export const POST = withApi(
  {
    id: 'invoices.debitNote',
    scope: 'tenant',
    permission: { action: 'credit.create', resourceType: 'invoice' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: debitNoteSchema,
    idempotent: true,
    maxBodyBytes: 1_000_000,
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await createDebitNote(actor, p.id, body) };
  },
);
