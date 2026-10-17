// path: app/api/credit-notes/[id]/void/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { creditVoidSchema } from '@/lib/credit/input';
import { voidCreditNote } from '@/services/credit/credit-notes';

export const POST = withApi(
  {
    id: 'creditNotes.void',
    scope: 'tenant',
    permission: { action: 'credit.void', resourceType: 'credit_note' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: creditVoidSchema,
    auditExempt: 'The credit service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await voidCreditNote(actor, p.id, body.reason) };
  },
);
